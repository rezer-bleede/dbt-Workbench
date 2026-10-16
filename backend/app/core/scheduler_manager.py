import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import get_settings
from app.database.connection import SessionLocal
from app.services.scheduler_service import scheduler_service
from app.database.models import models as db_models
from app.schemas.execution import RunStatus
from app.schemas.scheduler import CatchUpPolicy, TriggeringEvent, RetryStatus, RunFinalResult, RetryPolicy
from app.services.dbt_executor import executor

logger = logging.getLogger(__name__)

_scheduler_task: Optional[asyncio.Task] = None
_running: bool = False


async def _scheduler_loop() -> None:
    global _running
    settings = get_settings()
    poll_interval = settings.scheduler_poll_interval_seconds

    while _running:
        try:
            await _tick()
        except Exception as exc:
            logger.exception("Scheduler loop tick failed: %s", exc)
        await asyncio.sleep(poll_interval)


async def _tick() -> None:
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        # Process due schedules
        due_schedules = scheduler_service.find_due_schedules(db, now)
        for db_schedule in due_schedules:
            _process_due_schedule(db, db_schedule, now)

        # Update attempt statuses from executor
        _update_attempt_statuses(db)

        # Schedule retries for failed runs according to retry policies
        await _schedule_retries(db, now)

        # Apply retention policies
        scheduler_service.apply_retention_policies(db, now)
    finally:
        db.close()


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalize datetimes to timezone-aware UTC values.

    Datetimes persisted in the database can come back as offset-naive values
    because the SQLAlchemy columns are not timezone-aware. The scheduler makes
    comparisons against ``datetime.now(timezone.utc)``, so we need to align
    everything to UTC to avoid ``TypeError`` when mixing aware/naive values.
    """

    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _process_due_schedule(db, db_schedule: db_models.Schedule, now: datetime) -> None:
    catch_up = CatchUpPolicy(db_schedule.catch_up_policy)
    max_catchup = get_settings().scheduler_max_catchup_runs

    cron_expression = db_schedule.cron_expression
    timezone_name = db_schedule.timezone or get_settings().scheduler_default_timezone

    next_run_time = _ensure_utc(db_schedule.next_run_time) or _ensure_utc(now)
    now = _ensure_utc(now) or datetime.now(timezone.utc)
    created = 0

    while next_run_time and next_run_time <= now and created < max_catchup:
        scheduled_run = scheduler_service.create_scheduled_run(
            db=db,
            db_schedule=db_schedule,
            scheduled_time=_ensure_utc(next_run_time),
            triggering_event=TriggeringEvent.CRON,
        )
        if scheduled_run:
            # Start first attempt asynchronously
            _schedule_attempt_start(scheduled_run.id)

        created += 1
        next_run_time = scheduler_service._compute_next_run_time(
            cron_expression=cron_expression,
            timezone_name=timezone_name,
            from_time=next_run_time,
        )
        db_schedule.next_run_time = next_run_time
        db_schedule.last_run_time = now
        db.add(db_schedule)
        db.commit()

        if catch_up == CatchUpPolicy.SKIP:
            break

    if created == 0 and next_run_time and next_run_time <= now:
        next_run_time = scheduler_service._compute_next_run_time(
            cron_expression=cron_expression,
            timezone_name=timezone_name,
            from_time=now,
        )
        db_schedule.next_run_time = next_run_time
        db.add(db_schedule)
        db.commit()


async def _start_attempt_async(scheduled_run_id: int) -> None:
    db = SessionLocal()
    try:
        db_run = (
            db.query(db_models.ScheduledRun)
            .filter(db_models.ScheduledRun.id == scheduled_run_id)
            .first()
        )
        if not db_run:
            logger.warning("Scheduled run %s not found when starting attempt.", scheduled_run_id)
            return
        attempt = await scheduler_service.start_attempt_for_scheduled_run(db, db_run)
        if attempt and attempt.run_id:
            db_run_check = (
                db.query(db_models.ScheduledRun)
                .filter(db_models.ScheduledRun.id == scheduled_run_id)
                .first()
            )
            if db_run_check:
                asyncio.create_task(executor.execute_run(attempt.run_id))
            else:
                logger.warning("Scheduled run %s was removed before execution.", scheduled_run_id)
    except Exception as exc:
        logger.exception("Error in _start_attempt_async for scheduled_run_id %s: %s", scheduled_run_id, exc)
    finally:
        db.close()


def _schedule_attempt_start(scheduled_run_id: int) -> None:
    """Start attempt execution, working both inside and outside running loops."""

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_start_attempt_async(scheduled_run_id))
    except RuntimeError:
        asyncio.run(_start_attempt_async(scheduled_run_id))


def _update_attempt_statuses(db) -> None:
    attempts = db.query(db_models.ScheduledRunAttempt).all()
    for attempt in attempts:
        if attempt.status in (
            RunStatus.SUCCEEDED.value,
            RunStatus.FAILED.value,
            RunStatus.CANCELLED.value,
        ):
            continue
        scheduler_service.update_attempt_status_from_executor(db, attempt)


async def _schedule_retries(db, now: datetime) -> None:
    runs = (
        db.query(db_models.ScheduledRun)
        .filter(db_models.ScheduledRun.retry_status == RetryStatus.IN_PROGRESS.value)
        .all()
    )
    for run in runs:
        schedule = run.schedule
        retry_policy = RetryPolicy(**(schedule.retry_policy or {}))
        if retry_policy.max_retries <= 0:
            run.retry_status = RetryStatus.EXHAUSTED.value
            db.add(run)
            db.commit()
            continue

        attempts = sorted(run.attempts, key=lambda a: a.attempt_number)
        if not attempts:
            continue
        last_attempt = attempts[-1]

        if last_attempt.status not in (
            RunStatus.FAILED.value,
            RunStatus.CANCELLED.value,
        ):
            continue

        if not last_attempt.finished_at:
            continue

        next_attempt_number = last_attempt.attempt_number + 1
        if next_attempt_number > retry_policy.max_retries + 1:
            run.retry_status = RetryStatus.EXHAUSTED.value
            db.add(run)
            db.commit()
            continue

        delay = scheduler_service.compute_retry_delay(retry_policy, next_attempt_number)
        if last_attempt.finished_at + timedelta(seconds=delay) > now:
            continue

        new_attempt = await scheduler_service.start_attempt_for_scheduled_run(db, run)
        if new_attempt and new_attempt.run_id:
            asyncio.create_task(executor.execute_run(new_attempt.run_id))


async def start_scheduler() -> None:
    global _scheduler_task, _running
    settings = get_settings()
    if not settings.scheduler_enabled:
        logger.info("Scheduler is disabled via configuration")
        return
    if _scheduler_task is not None:
        return
    _running = True
    _scheduler_task = asyncio.create_task(_scheduler_loop())
    logger.info("Scheduler started")


async def stop_scheduler() -> None:
    global _scheduler_task, _running
    if _scheduler_task is None:
        return
    _running = False
    try:
        await _scheduler_task
    finally:
        _scheduler_task = None
        logger.info("Scheduler stopped")