import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from croniter import croniter
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.schemas.execution import DbtCommand, RunStatus
from app.schemas.scheduler import (
    BackoffStrategy,
    CatchUpPolicy,
    Environment,
    EnvironmentCreate,
    EnvironmentUpdate,
    NotificationConfig,
    NotificationTestChannelResult,
    NotificationTestRequest,
    NotificationTestResponse,
    OverlapPolicy,
    RetryPolicy,
    RetryStatus,
    RunFinalResult,
    Schedule,
    ScheduleCreate,
    ScheduleMetrics,
    ScheduleSummary,
    ScheduleUpdate,
    ScheduleStatus,
    ScheduledRun,
    ScheduledRunAttempt,
    ScheduledRunListResponse,
    SchedulerLogEntry,
    SchedulerOverview,
    TriggeringEvent,
    RetentionPolicy,
    RetentionAction,
    NotificationTrigger,
    NotificationChannelType,
)
from app.services.dbt_executor import executor
from app.services.notification_service import notification_service

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self) -> None:
        self.settings = get_settings()

    # --- Session management ---

    def _get_db(self) -> Session:
        return SessionLocal()

    # --- Environment management ---

    def list_environments(
        self,
        db: Session,
        workspace_id: Optional[int] = None,
    ) -> List[Environment]:
        query = db.query(db_models.Environment)
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        query = query.order_by(db_models.Environment.id)
        envs = query.all()

        if not envs:
            # Ensure at least one default environment exists for convenience
            now = datetime.now(timezone.utc)
            default_env = db_models.Environment(
                name="default",
                description="Default environment",
                dbt_target_name=None,
                connection_profile_reference=None,
                variables={},
                default_retention_policy=None,
                created_at=now,
                updated_at=now,
                workspace_id=workspace_id,
            )
            db.add(default_env)
            db.commit()
            db.refresh(default_env)
            return [self._to_environment_schema(default_env)]

        return [self._to_environment_schema(e) for e in envs]

    def get_environment(
        self,
        db: Session,
        environment_id: int,
        workspace_id: Optional[int] = None,
    ) -> Optional[Environment]:
        query = db.query(db_models.Environment).filter(
            db_models.Environment.id == environment_id,
        )
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        env = query.first()
        if not env:
            return None
        return self._to_environment_schema(env)

    def create_environment(
        self,
        db: Session,
        env_in: EnvironmentCreate,
        workspace_id: Optional[int] = None,
    ) -> Environment:
        now = datetime.now(timezone.utc)
        db_env = db_models.Environment(
            name=env_in.name,
            description=env_in.description,
            dbt_target_name=env_in.dbt_target_name,
            connection_profile_reference=env_in.connection_profile_reference,
            variables=env_in.variables,
            default_retention_policy=env_in.default_retention_policy.model_dump()
            if env_in.default_retention_policy
            else None,
            created_at=now,
            updated_at=now,
            workspace_id=workspace_id,
        )
        db.add(db_env)
        db.commit()
        db.refresh(db_env)
        return self._to_environment_schema(db_env)

    def update_environment(
        self,
        db: Session,
        environment_id: int,
        env_in: EnvironmentUpdate,
        workspace_id: Optional[int] = None,
    ) -> Optional[Environment]:
        query = db.query(db_models.Environment).filter(db_models.Environment.id == environment_id)
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        db_env = query.first()
        if not db_env:
            return None

        if env_in.name is not None:
            db_env.name = env_in.name
        if env_in.description is not None:
            db_env.description = env_in.description
        if env_in.dbt_target_name is not None:
            db_env.dbt_target_name = env_in.dbt_target_name
        if env_in.connection_profile_reference is not None:
            db_env.connection_profile_reference = env_in.connection_profile_reference
        if env_in.variables is not None:
            db_env.variables = env_in.variables
        if env_in.default_retention_policy is not None:
            db_env.default_retention_policy = (
                env_in.default_retention_policy.model_dump() if env_in.default_retention_policy else None
            )

        db_env.updated_at = datetime.now(timezone.utc)
        db.add(db_env)
        db.commit()
        db.refresh(db_env)
        return self._to_environment_schema(db_env)

    def _to_environment_schema(self, db_env: db_models.Environment) -> Environment:
        return Environment(
            id=db_env.id,
            name=db_env.name,
            description=db_env.description,
            dbt_target_name=db_env.dbt_target_name,
            connection_profile_reference=db_env.connection_profile_reference,
            variables=db_env.variables or {},
            default_retention_policy=db_env.default_retention_policy,
            created_at=db_env.created_at,
            updated_at=db_env.updated_at,
        )

    # --- Schedule management ---

    def list_schedules(
        self,
        db: Session,
        workspace_id: Optional[int] = None,
    ) -> List[ScheduleSummary]:
        query = db.query(db_models.Schedule).join(db_models.Environment)
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        schedules = query.order_by(db_models.Schedule.id).all()
        return [self._to_schedule_summary_schema(s) for s in schedules]

    def get_schedule(
        self,
        db: Session,
        schedule_id: int,
        workspace_id: Optional[int] = None,
    ) -> Optional[Schedule]:
        query = db.query(db_models.Schedule).join(db_models.Environment).filter(
            db_models.Schedule.id == schedule_id,
        )
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        db_schedule = query.first()
        if not db_schedule:
            return None
        return self._to_schedule_schema(db_schedule)

    def create_schedule(
        self,
        db: Session,
        schedule_in: ScheduleCreate,
        workspace_id: Optional[int] = None,
    ) -> Schedule:
        now = datetime.now(timezone.utc)

        # Ensure the environment belongs to the given workspace if one is provided
        if workspace_id is not None:
            env = (
                db.query(db_models.Environment)
                .filter(
                    db_models.Environment.id == schedule_in.environment_id,
                    db_models.Environment.workspace_id == workspace_id,
                )
                .first()
            )
            if not env:
                raise ValueError("Environment does not belong to the active workspace")

        next_run_time = self._compute_next_run_time(
            cron_expression=schedule_in.cron_expression,
            timezone_name=schedule_in.timezone or self.settings.scheduler_default_timezone,
            from_time=now,
        )

        db_schedule = db_models.Schedule(
            name=schedule_in.name,
            description=schedule_in.description,
            cron_expression=schedule_in.cron_expression,
            timezone=schedule_in.timezone,
            dbt_command=schedule_in.dbt_command.value,
            environment_id=schedule_in.environment_id,
            notification_config=schedule_in.notification_config.model_dump(),
            retry_policy=schedule_in.retry_policy.model_dump(),
            retention_policy=schedule_in.retention_policy.model_dump()
            if schedule_in.retention_policy
            else None,
            catch_up_policy=schedule_in.catch_up_policy.value,
            overlap_policy=schedule_in.overlap_policy.value,
            enabled=schedule_in.enabled,
            status=ScheduleStatus.ACTIVE.value if schedule_in.enabled else ScheduleStatus.PAUSED.value,
            next_run_time=next_run_time,
            last_run_time=None,
            created_at=now,
            updated_at=now,
            created_by=schedule_in.created_by,
            updated_by=schedule_in.created_by,
        )

        db.add(db_schedule)
        db.commit()
        db.refresh(db_schedule)
        self._log_scheduler_event(
            db,
            schedule_id=db_schedule.id,
            scheduled_run_id=None,
            event_type="schedule_created",
            message=f"Schedule '{db_schedule.name}' created",
            details={},
        )
        return self._to_schedule_schema(db_schedule)

    def update_schedule(
        self,
        db: Session,
        schedule_id: int,
        schedule_in: ScheduleUpdate,
        workspace_id: Optional[int] = None,
    ) -> Optional[Schedule]:
        query = db.query(db_models.Schedule).join(db_models.Environment).filter(
            db_models.Schedule.id == schedule_id,
        )
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        db_schedule = query.first()
        if not db_schedule:
            return None

        if schedule_in.name is not None:
            db_schedule.name = schedule_in.name
        if schedule_in.description is not None:
            db_schedule.description = schedule_in.description
        if schedule_in.cron_expression is not None:
            db_schedule.cron_expression = schedule_in.cron_expression
        if schedule_in.timezone is not None:
            db_schedule.timezone = schedule_in.timezone
        if schedule_in.dbt_command is not None:
            db_schedule.dbt_command = schedule_in.dbt_command.value
        if schedule_in.environment_id is not None:
            if workspace_id is not None:
                env = (
                    db.query(db_models.Environment)
                    .filter(
                        db_models.Environment.id == schedule_in.environment_id,
                        db_models.Environment.workspace_id == workspace_id,
                    )
                    .first()
                )
                if not env:
                    raise ValueError("Environment does not belong to the active workspace")
        if schedule_in.notification_config is not None:
            db_schedule.notification_config = schedule_in.notification_config.model_dump()
        if schedule_in.retry_policy is not None:
            db_schedule.retry_policy = schedule_in.retry_policy.model_dump()
        if schedule_in.retention_policy is not None:
            db_schedule.retention_policy = (
                schedule_in.retention_policy.model_dump() if schedule_in.retention_policy else None
            )
        if schedule_in.catch_up_policy is not None:
            db_schedule.catch_up_policy = schedule_in.catch_up_policy.value
        if schedule_in.overlap_policy is not None:
            db_schedule.overlap_policy = schedule_in.overlap_policy.value
        if schedule_in.enabled is not None:
            db_schedule.enabled = schedule_in.enabled
            db_schedule.status = (
                ScheduleStatus.ACTIVE.value if schedule_in.enabled else ScheduleStatus.PAUSED.value
            )

        if schedule_in.cron_expression is not None or schedule_in.timezone is not None:
            now = datetime.now(timezone.utc)
            db_schedule.next_run_time = self._compute_next_run_time(
                cron_expression=db_schedule.cron_expression,
                timezone_name=db_schedule.timezone or self.settings.scheduler_default_timezone,
                from_time=now,
            )

        db_schedule.updated_at = datetime.now(timezone.utc)
        if schedule_in.updated_by is not None:
            db_schedule.updated_by = schedule_in.updated_by

        db.add(db_schedule)
        db.commit()
        db.refresh(db_schedule)

        self._log_scheduler_event(
            db,
            schedule_id=db_schedule.id,
            scheduled_run_id=None,
            event_type="schedule_updated",
            message=f"Schedule '{db_schedule.name}' updated",
            details={},
        )

        return self._to_schedule_schema(db_schedule)

    def delete_schedule(
        self,
        db: Session,
        schedule_id: int,
        workspace_id: Optional[int] = None,
    ) -> bool:
        query = db.query(db_models.Schedule).join(db_models.Environment).filter(
            db_models.Schedule.id == schedule_id,
        )
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        db_schedule = query.first()
        if not db_schedule:
            return False
        db.delete(db_schedule)
        db.commit()
        return True

    def pause_schedule(
        self,
        db: Session,
        schedule_id: int,
        workspace_id: Optional[int] = None,
    ) -> Optional[Schedule]:
        query = db.query(db_models.Schedule).join(db_models.Environment).filter(
            db_models.Schedule.id == schedule_id,
        )
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        db_schedule = query.first()
        if not db_schedule:
            return None
        db_schedule.enabled = False
        db_schedule.status = ScheduleStatus.PAUSED.value
        db_schedule.updated_at = datetime.now(timezone.utc)
        db.add(db_schedule)
        db.commit()
        db.refresh(db_schedule)

        self._log_scheduler_event(
            db,
            schedule_id=db_schedule.id,
            scheduled_run_id=None,
            event_type="schedule_paused",
            message=f"Schedule '{db_schedule.name}' paused",
            details={},
        )

        return self._to_schedule_schema(db_schedule)

    def resume_schedule(
        self,
        db: Session,
        schedule_id: int,
        workspace_id: Optional[int] = None,
    ) -> Optional[Schedule]:
        query = db.query(db_models.Schedule).join(db_models.Environment).filter(
            db_models.Schedule.id == schedule_id,
        )
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        db_schedule = query.first()
        if not db_schedule:
            return None
        db_schedule.enabled = True
        db_schedule.status = ScheduleStatus.ACTIVE.value
        now = datetime.now(timezone.utc)
        db_schedule.next_run_time = self._compute_next_run_time(
            cron_expression=db_schedule.cron_expression,
            timezone_name=db_schedule.timezone or self.settings.scheduler_default_timezone,
            from_time=now,
        )
        db_schedule.updated_at = now
        db.add(db_schedule)
        db.commit()
        db.refresh(db_schedule)

        self._log_scheduler_event(
            db,
            schedule_id=db_schedule.id,
            scheduled_run_id=None,
            event_type="schedule_resumed",
            message=f"Schedule '{db_schedule.name}' resumed",
            details={},
        )

        return self._to_schedule_schema(db_schedule)

    def _to_schedule_summary_schema(self, db_schedule: db_models.Schedule) -> ScheduleSummary:
        return ScheduleSummary(
            id=db_schedule.id,
            name=db_schedule.name,
            description=db_schedule.description,
            environment_id=db_schedule.environment_id,
            dbt_command=DbtCommand(db_schedule.dbt_command),
            status=ScheduleStatus(db_schedule.status),
            next_run_time=db_schedule.next_run_time,
            last_run_time=db_schedule.last_run_time,
            enabled=db_schedule.enabled,
        )

    def _to_schedule_schema(self, db_schedule: db_models.Schedule) -> Schedule:
        return Schedule(
            id=db_schedule.id,
            name=db_schedule.name,
            description=db_schedule.description,
            cron_expression=db_schedule.cron_expression,
            timezone=db_schedule.timezone,
            dbt_command=DbtCommand(db_schedule.dbt_command),
            environment_id=db_schedule.environment_id,
            notification_config=db_schedule.notification_config or {},
            retry_policy=db_schedule.retry_policy or {},
            retention_policy=db_schedule.retention_policy,
            catch_up_policy=CatchUpPolicy(db_schedule.catch_up_policy),
            overlap_policy=OverlapPolicy(db_schedule.overlap_policy),
            enabled=db_schedule.enabled,
            status=ScheduleStatus(db_schedule.status),
            next_run_time=db_schedule.next_run_time,
            last_run_time=db_schedule.last_run_time,
            created_at=db_schedule.created_at,
            updated_at=db_schedule.updated_at,
            created_by=db_schedule.created_by,
            updated_by=db_schedule.updated_by,
        )

    # --- Scheduled run management ---

    def list_runs_for_schedule(
        self,
        db: Session,
        schedule_id: int,
        workspace_id: Optional[int] = None,
    ) -> ScheduledRunListResponse:
        query = (
            db.query(db_models.ScheduledRun)
            .join(db_models.Schedule)
            .join(db_models.Environment)
            .filter(db_models.ScheduledRun.schedule_id == schedule_id)
        )
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        db_runs = query.order_by(db_models.ScheduledRun.scheduled_at.desc()).all()
        runs = [self._to_scheduled_run_schema(r) for r in db_runs]
        return ScheduledRunListResponse(schedule_id=schedule_id, runs=runs)

    def _to_scheduled_run_schema(self, db_run: db_models.ScheduledRun) -> ScheduledRun:
        attempts = [
            ScheduledRunAttempt(
                id=a.id,
                attempt_number=a.attempt_number,
                run_id=a.run_id,
                status=RunStatus(a.status),
                queued_at=a.queued_at,
                started_at=a.started_at,
                finished_at=a.finished_at,
                error_message=a.error_message,
            )
            for a in sorted(db_run.attempts, key=lambda at: at.attempt_number)
        ]

        return ScheduledRun(
            id=db_run.id,
            schedule_id=db_run.schedule_id,
            triggering_event=TriggeringEvent(db_run.triggering_event),
            status=RunFinalResult(db_run.status),
            retry_status=RetryStatus(db_run.retry_status),
            attempts_total=db_run.attempts_total,
            scheduled_at=db_run.scheduled_at,
            queued_at=db_run.queued_at,
            started_at=db_run.started_at,
            finished_at=db_run.finished_at,
            environment_snapshot=db_run.environment_snapshot or {},
            command=db_run.command or {},
            log_links=db_run.log_links or {},
            artifact_links=db_run.artifact_links or {},
            attempts=attempts,
        )

    # --- Cron utilities ---

    def _compute_next_run_time(
        self,
        cron_expression: str,
        timezone_name: str,
        from_time: datetime,
    ) -> Optional[datetime]:
        try:
            # Interpret cron in the schedule's timezone, then convert to UTC for storage/processing
            try:
                from zoneinfo import ZoneInfo  # Python 3.11+
            except ImportError:
                ZoneInfo = None  # type: ignore

            if ZoneInfo is not None:
                tz = ZoneInfo(timezone_name)
                base_local = from_time.astimezone(tz)
                itr = croniter(cron_expression, base_local)
                next_local = itr.get_next(datetime)
                next_utc = next_local.astimezone(timezone.utc)
            else:
                base = from_time.replace(tzinfo=timezone.utc)
                itr = croniter(cron_expression, base)
                next_utc = itr.get_next(datetime).astimezone(timezone.utc)

            return next_utc
        except Exception as exc:
            logger.error("Failed to compute next run time for cron '%s': %s", cron_expression, exc)
            return None

    # --- Scheduler loop operations ---

    def find_due_schedules(self, db: Session, now: datetime) -> List[db_models.Schedule]:
        return (
            db.query(db_models.Schedule)
            .filter(
                db_models.Schedule.enabled.is_(True),
                db_models.Schedule.next_run_time.isnot(None),
                db_models.Schedule.next_run_time <= now,
            )
            .all()
        )

    def create_scheduled_run(
        self,
        db: Session,
        db_schedule: db_models.Schedule,
        scheduled_time: datetime,
        triggering_event: TriggeringEvent,
    ) -> Optional[db_models.ScheduledRun]:
        if db_schedule.overlap_policy == OverlapPolicy.NO_OVERLAP.value:
            active = (
                db.query(db_models.ScheduledRun)
                .filter(
                    db_models.ScheduledRun.schedule_id == db_schedule.id,
                    db_models.ScheduledRun.status.notin_(
                        [
                            RunFinalResult.SUCCESS.value,
                            RunFinalResult.FAILURE.value,
                            RunFinalResult.CANCELLED.value,
                            RunFinalResult.SKIPPED.value,
                        ]
                    ),
                )
                .first()
            )
            if active:
                return None

        env = db.query(db_models.Environment).filter(db_models.Environment.id == db_schedule.environment_id).first()
        if not env:
            logger.error("Environment %s not found for schedule %s", db_schedule.environment_id, db_schedule.id)
            return None

        environment_snapshot = {
            "id": env.id,
            "name": env.name,
            "dbt_target_name": env.dbt_target_name,
            "connection_profile_reference": env.connection_profile_reference,
            "variables": env.variables or {},
        }

        command = {
            "command": db_schedule.dbt_command,
            "environment_id": env.id,
        }

        now = datetime.now(timezone.utc)
        db_run = db_models.ScheduledRun(
            schedule_id=db_schedule.id,
            triggering_event=triggering_event.value,
            status=RunFinalResult.SKIPPED.value,
            retry_status=RetryStatus.NOT_APPLICABLE.value,
            attempts_total=0,
            scheduled_at=scheduled_time,
            queued_at=None,
            started_at=None,
            finished_at=None,
            environment_snapshot=environment_snapshot,
            command=command,
            log_links={},
            artifact_links={},
        )
        db.add(db_run)
        db.commit()
        db.refresh(db_run)

        self._log_scheduler_event(
            db,
            schedule_id=db_schedule.id,
            scheduled_run_id=db_run.id,
            event_type="scheduled_run_created",
            message=f"Scheduled run created for schedule '{db_schedule.name}'",
            details={
                "triggering_event": triggering_event.value,
                "scheduled_at": scheduled_time.isoformat(),
            },
        )
        return db_run

    async def start_attempt_for_scheduled_run(
        self,
        db: Session,
        db_scheduled_run: db_models.ScheduledRun,
    ) -> Optional[db_models.ScheduledRunAttempt]:
        schedule = db_scheduled_run.schedule
        retry_policy = RetryPolicy(**(schedule.retry_policy or {}))

        attempt_number = db_scheduled_run.attempts_total + 1
        now = datetime.now(timezone.utc)

        parameters: Dict[str, Any] = {}
        env_snapshot = db_scheduled_run.environment_snapshot or {}
        variables = env_snapshot.get("variables") or {}
        target_name = env_snapshot.get("dbt_target_name")

        if target_name:
            parameters["target"] = target_name
        if variables:
            parameters["vars"] = variables

        dbt_command = DbtCommand(schedule.dbt_command)

        try:
            run_id = await executor.start_run(
                command=dbt_command,
                parameters=parameters,
                description=f"Scheduled run (schedule {schedule.id}, attempt {attempt_number})",
            )
        except RuntimeError as exc:
            logger.warning("Max concurrent runs reached; cannot start scheduled run: %s", exc)
            return None

        db_attempt = db_models.ScheduledRunAttempt(
            scheduled_run_id=db_scheduled_run.id,
            attempt_number=attempt_number,
            run_id=run_id,
            db_run_id=None,
            status=RunStatus.QUEUED.value,
            queued_at=now,
            started_at=None,
            finished_at=None,
            error_message=None,
        )
        db.add(db_attempt)

        db_scheduled_run.attempts_total = attempt_number
        db_scheduled_run.status = RunFinalResult.SKIPPED.value
        db_scheduled_run.retry_status = (
            RetryStatus.NOT_APPLICABLE.value if retry_policy.max_retries == 0 else RetryStatus.IN_PROGRESS.value
        )
        db_scheduled_run.queued_at = now
        db_scheduled_run.started_at = None
        db_scheduled_run.finished_at = None

        db.add(db_scheduled_run)
        db.commit()
        db.refresh(db_attempt)
        db.refresh(db_scheduled_run)

        self._log_scheduler_event(
            db,
            schedule_id=db_scheduled_run.schedule_id,
            scheduled_run_id=db_scheduled_run.id,
            event_type="scheduled_run_attempt_started",
            message=f"Attempt {attempt_number} started for schedule run {db_scheduled_run.id}",
            details={"run_id": run_id},
        )

        # Fire non-blocking notifications for run start
        asyncio.create_task(
            self._send_and_record_notifications(
                db_scheduled_run.id,
                NotificationTrigger.RUN_STARTED,
            )
        )

        return db_attempt

    def update_attempt_status_from_executor(
        self,
        db: Session,
        db_attempt: db_models.ScheduledRunAttempt,
    ) -> None:
        if not db_attempt.run_id:
            return

        summary = executor.get_run_status(db_attempt.run_id)
        if not summary:
            return

        db_attempt.status = summary.status.value
        if summary.status == RunStatus.RUNNING and db_attempt.started_at is None:
            db_attempt.started_at = summary.start_time
        if summary.status in (RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELLED):
            db_attempt.finished_at = summary.end_time or datetime.now(timezone.utc)
            if summary.error_message:
                db_attempt.error_message = summary.error_message

        db.add(db_attempt)
        db.commit()

        scheduled_run = db_attempt.scheduled_run
        if summary.status in (RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELLED):
            self._update_scheduled_run_aggregate(db, scheduled_run)

    def _update_scheduled_run_aggregate(self, db: Session, db_scheduled_run: db_models.ScheduledRun) -> None:
        attempts = sorted(db_scheduled_run.attempts, key=lambda a: a.attempt_number)
        if not attempts:
            return

        last_attempt = attempts[-1]
        db_scheduled_run.queued_at = attempts[0].queued_at
        db_scheduled_run.started_at = attempts[0].started_at
        db_scheduled_run.finished_at = last_attempt.finished_at
        # Update convenience links to execution APIs
        run_id = last_attempt.run_id
        if run_id:
            db_scheduled_run.log_links = {
                "run_detail": f"/execution/runs/{run_id}/detail",
                "logs": f"/execution/runs/{run_id}/logs",
            }
            db_scheduled_run.artifact_links = {
                "artifacts": f"/execution/runs/{run_id}/artifacts",
            }

        previous_status = db_scheduled_run.status
        previous_retry_status = db_scheduled_run.retry_status

        if last_attempt.status == RunStatus.SUCCEEDED.value:
            db_scheduled_run.status = RunFinalResult.SUCCESS.value
            db_scheduled_run.retry_status = (
                RetryStatus.NOT_APPLICABLE.value
                if db_scheduled_run.attempts_total <= 1
                else RetryStatus.IN_PROGRESS.value
            )
        elif last_attempt.status == RunStatus.CANCELLED.value:
            db_scheduled_run.status = RunFinalResult.CANCELLED.value
            db_scheduled_run.retry_status = RetryStatus.EXHAUSTED.value
        elif last_attempt.status == RunStatus.FAILED.value:
            schedule = db_scheduled_run.schedule
            retry_policy = RetryPolicy(**(schedule.retry_policy or {}))
            if db_scheduled_run.attempts_total > retry_policy.max_retries:
                db_scheduled_run.status = RunFinalResult.FAILURE.value
                db_scheduled_run.retry_status = RetryStatus.EXHAUSTED.value
            else:
                db_scheduled_run.status = RunFinalResult.FAILURE.value
                db_scheduled_run.retry_status = RetryStatus.IN_PROGRESS.value

        db.add(db_scheduled_run)
        db.commit()

        # Dispatch notifications when aggregate status reaches a terminal state
        if (
            db_scheduled_run.status != previous_status
            or db_scheduled_run.retry_status != previous_retry_status
        ):
            trigger: Optional[NotificationTrigger] = None
            if db_scheduled_run.status == RunFinalResult.SUCCESS.value:
                trigger = NotificationTrigger.RUN_SUCCEEDED
            elif db_scheduled_run.status == RunFinalResult.CANCELLED.value:
                trigger = NotificationTrigger.RUN_CANCELLED
            elif (
                db_scheduled_run.status == RunFinalResult.FAILURE.value
                and db_scheduled_run.retry_status == RetryStatus.EXHAUSTED.value
            ):
                trigger = NotificationTrigger.RUN_FAILED

            if trigger is not None:
                asyncio.create_task(
                    self._send_and_record_notifications(
                        db_scheduled_run.id,
                        trigger,
                    )
                )

    # --- Retry utilities ---

    def compute_retry_delay(self, retry_policy: RetryPolicy, attempt_number: int) -> int:
        if retry_policy.backoff_strategy == BackoffStrategy.FIXED:
            return retry_policy.delay_seconds

        base_delay = retry_policy.delay_seconds
        delay = base_delay * (2 ** max(attempt_number - 1, 0))
        if retry_policy.max_delay_seconds is not None:
            delay = min(delay, retry_policy.max_delay_seconds)
        return delay

    # --- Monitoring and metrics ---

    def get_overview(
        self,
        db: Session,
        workspace_id: Optional[int] = None,
    ) -> SchedulerOverview:
        query = db.query(db_models.Schedule).join(db_models.Environment)
        if workspace_id is not None:
            query = query.filter(db_models.Environment.workspace_id == workspace_id)
        active_count = query.filter(db_models.Schedule.enabled.is_(True)).count()
        paused_count = query.filter(db_models.Schedule.enabled.is_(False)).count()
        next_run_times: Dict[int, Optional[datetime]] = {}
        schedules = query.with_entities(
            db_models.Schedule.id,
            db_models.Schedule.next_run_time,
        ).all()
        for schedule_id, next_run_time in schedules:
            next_run_times[schedule_id] = next_run_time

        runs_query = (
            db.query(db_models.ScheduledRun)
            .join(db_models.Schedule)
            .join(db_models.Environment)
        )
        if workspace_id is not None:
            runs_query = runs_query.filter(db_models.Environment.workspace_id == workspace_id)

        total_scheduled_runs = runs_query.count()
        success_count = runs_query.filter(
            db_models.ScheduledRun.status == RunFinalResult.SUCCESS.value
        ).count()
        failure_count = runs_query.filter(
            db_models.ScheduledRun.status == RunFinalResult.FAILURE.value
        ).count()

        return SchedulerOverview(
            active_schedules=active_count,
            paused_schedules=paused_count,
            next_run_times=next_run_times,
            total_scheduled_runs=total_scheduled_runs,
            total_successful_runs=success_count,
            total_failed_runs=failure_count,
        )

    def get_metrics_for_schedule(self, db: Session, schedule_id: int) -> Optional[ScheduleMetrics]:
        runs = (
            db.query(db_models.ScheduledRun)
            .filter(db_models.ScheduledRun.schedule_id == schedule_id)
            .all()
        )
        if not runs:
            return None

        total = len(runs)
        success = sum(1 for r in runs if r.status == RunFinalResult.SUCCESS.value)
        failure = sum(1 for r in runs if r.status == RunFinalResult.FAILURE.value)
        cancelled = sum(1 for r in runs if r.status == RunFinalResult.CANCELLED.value)
        skipped = sum(1 for r in runs if r.status == RunFinalResult.SKIPPED.value)
        exhausted = sum(
            1 for r in runs if r.retry_status == RetryStatus.EXHAUSTED.value
        )

        last_run = max(runs, key=lambda r: r.finished_at or r.scheduled_at)
        last_status = RunFinalResult(last_run.status)
        last_time = last_run.finished_at or last_run.scheduled_at

        return ScheduleMetrics(
            schedule_id=schedule_id,
            total_runs=total,
            success_count=success,
            failure_count=failure,
            cancelled_count=cancelled,
            skipped_count=skipped,
            retry_exhausted_count=exhausted,
            last_run_status=last_status,
            last_run_time=last_time,
        )

    def get_logs_for_schedule(self, db: Session, schedule_id: int) -> List[SchedulerLogEntry]:
        logs = (
            db.query(db_models.SchedulerEvent)
            .filter(db_models.SchedulerEvent.schedule_id == schedule_id)
            .order_by(db_models.SchedulerEvent.timestamp.desc())
            .all()
        )
        return [
            SchedulerLogEntry(
                id=log.id,
                schedule_id=log.schedule_id,
                scheduled_run_id=log.scheduled_run_id,
                level=log.level,
                event_type=log.event_type,
                message=log.message,
                details=log.details or {},
                timestamp=log.timestamp,
            )
            for log in logs
        ]

    # --- Retention policies ---

    def apply_retention_policies(self, db: Session, now: datetime) -> None:
        schedules = db.query(db_models.Schedule).all()
        for schedule in schedules:
            policy_data = schedule.retention_policy
            if policy_data:
                policy = RetentionPolicy(**policy_data)
            elif schedule.environment and schedule.environment.default_retention_policy:
                policy = RetentionPolicy(**schedule.environment.default_retention_policy)
            else:
                continue

            # Apply per-schedule retention to this schedule's runs
            self._apply_retention_for_schedule(db, schedule, policy, now)

        db.commit()

    def _apply_retention_for_schedule(
        self,
        db: Session,
        schedule: db_models.Schedule,
        policy: RetentionPolicy,
        now: datetime,
    ) -> None:
        runs = (
            db.query(db_models.ScheduledRun)
            .filter(db_models.ScheduledRun.schedule_id == schedule.id)
            .order_by(db_models.ScheduledRun.scheduled_at.desc())
            .all()
        )
        if not runs:
            return

        candidates = list(runs)

        # Keep the most recent N runs if configured
        if policy.keep_last_n_runs is not None and policy.keep_last_n_runs > 0:
            keep_ids = {r.id for r in runs[: policy.keep_last_n_runs]}
            candidates = [r for r in candidates if r.id not in keep_ids]

        # Apply age-based cutoff if configured
        if policy.keep_for_n_days is not None and policy.keep_for_n_days > 0:
            cutoff = now - timedelta(days=policy.keep_for_n_days)
            candidates = [
                r for r in candidates if (r.scheduled_at or r.finished_at or now) < cutoff
            ]

        # Only operate on runs that are in a terminal state
        final_statuses = {
            RunFinalResult.SUCCESS.value,
            RunFinalResult.FAILURE.value,
            RunFinalResult.CANCELLED.value,
        }
        candidates = [r for r in candidates if r.status in final_statuses]

        if not candidates:
            return

        if policy.action == RetentionAction.DELETE:
            for r in candidates:
                db.delete(r)
                self._log_scheduler_event(
                    db,
                    schedule_id=schedule.id,
                    scheduled_run_id=r.id,
                    event_type="retention_deleted",
                    message="Scheduled run deleted by retention policy",
                    details={},
                )
        elif policy.action == RetentionAction.ARCHIVE:
            for r in candidates:
                # Mark as archived by clearing heavy links but preserving core metadata
                r.log_links = {}
                r.artifact_links = {}
                db.add(r)
                self._log_scheduler_event(
                    db,
                    schedule_id=schedule.id,
                    scheduled_run_id=r.id,
                    event_type="retention_archived",
                    message="Scheduled run archived by retention policy",
                    details={},
                )

    # --- Notification testing ---

    async def test_notifications(
        self,
        db: Session,
        schedule_id: Optional[int],
        request: NotificationTestRequest,
    ) -> NotificationTestResponse:
        if request.notification_config is not None:
            config = request.notification_config
        elif schedule_id is not None:
            db_schedule = db.query(db_models.Schedule).filter(db_models.Schedule.id == schedule_id).first()
            if not db_schedule:
                return NotificationTestResponse(results=[])
            config = NotificationConfig(**(db_schedule.notification_config or {}))
        else:
            return NotificationTestResponse(results=[])

        payload = {
            "run_id": "<test>",
            "schedule_id": schedule_id,
            "schedule_name": "<test>",
            "status": "test",
            "timestamps": {},
            "environment": {},
            "command": {},
            "log_links": {},
            "artifact_links": {},
        }

        raw_results = await notification_service.test_notifications(config, payload)
        channel_results: List[NotificationTestChannelResult] = []
        for result in raw_results:
            channel = NotificationChannelType(result["channel"])
            channel_results.append(
                NotificationTestChannelResult(
                    channel=channel,
                    success=bool(result.get("success")),
                    error_message=result.get("error_message"),
                )
            )

        return NotificationTestResponse(results=channel_results)

    async def _send_and_record_notifications(
        self,
        scheduled_run_id: int,
        trigger: NotificationTrigger,
    ) -> None:
        db = SessionLocal()
        try:
            db_run = (
                db.query(db_models.ScheduledRun)
                .filter(db_models.ScheduledRun.id == scheduled_run_id)
                .first()
            )
            if not db_run:
                return

            schedule = db_run.schedule
            config = NotificationConfig(**(schedule.notification_config or {}))
            attempts = sorted(db_run.attempts, key=lambda a: a.attempt_number)
            last_attempt = attempts[-1] if attempts else None
            run_id = last_attempt.run_id if last_attempt else None

            payload = {
                "run_id": run_id,
                "schedule_id": schedule.id,
                "schedule_name": schedule.name,
                "status": db_run.status,
                "attempt_number": last_attempt.attempt_number if last_attempt else None,
                "timestamps": {
                    "scheduled_at": db_run.scheduled_at.isoformat() if db_run.scheduled_at else None,
                    "queued_at": db_run.queued_at.isoformat() if db_run.queued_at else None,
                    "started_at": db_run.started_at.isoformat() if db_run.started_at else None,
                    "finished_at": db_run.finished_at.isoformat() if db_run.finished_at else None,
                },
                "environment": db_run.environment_snapshot or {},
                "command": db_run.command or {},
                "log_links": {
                    "run_detail": f"/execution/runs/{run_id}/detail" if run_id else None,
                    "logs": f"/execution/runs/{run_id}/logs" if run_id else None,
                },
                "artifact_links": {
                    "artifacts": f"/execution/runs/{run_id}/artifacts" if run_id else None,
                },
            }

            raw_results = await notification_service.send_notifications(config, trigger, payload)
            for result in raw_results:
                event = db_models.NotificationEvent(
                    scheduled_run_id=scheduled_run_id,
                    channel=result["channel"],
                    trigger=trigger.value,
                    status="success" if result.get("success") else "failure",
                    error_message=result.get("error_message"),
                    payload=payload,
                    created_at=datetime.now(timezone.utc),
                )
                db.add(event)
            db.commit()
        finally:
            db.close()

    # --- Logging helpers ---

    def _log_scheduler_event(
        self,
        db: Session,
        schedule_id: Optional[int],
        scheduled_run_id: Optional[int],
        event_type: str,
        message: str,
        details: Dict[str, Any],
        level: str = "INFO",
    ) -> None:
        event = db_models.SchedulerEvent(
            schedule_id=schedule_id,
            scheduled_run_id=scheduled_run_id,
            level=level,
            event_type=event_type,
            message=message,
            details=details,
            timestamp=datetime.now(timezone.utc),
        )
        db.add(event)
        db.commit()


scheduler_service = SchedulerService()