import asyncio
from datetime import datetime, timezone

import pytest

from app.database.connection import Base, SessionLocal, engine
from app.database.models import models as db_models
from app.schemas.execution import RunStatus
from app.schemas.scheduler import RunFinalResult, TriggeringEvent
from app.services.scheduler_service import scheduler_service
from app.services import scheduler_service as scheduler_service_module
from app.services.dbt_executor import executor


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_manual_run_moves_into_progress_and_links_logs():
    db = SessionLocal()

    env = db_models.Environment(
        name="Test Env",
        description="",
        dbt_target_name="dev",
        connection_profile_reference="local",
        variables={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(env)
    db.commit()
    db.refresh(env)

    schedule = db_models.Schedule(
        name="Run now",
        description="",
        cron_expression="0 * * * *",
        timezone="UTC",
        dbt_command="run",
        environment_id=env.id,
        notification_config={},
        retry_policy={},
        retention_policy=None,
        catch_up_policy="skip",
        overlap_policy="no_overlap",
        enabled=True,
        status="active",
        next_run_time=datetime.now(timezone.utc),
        last_run_time=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    created_run = scheduler_service.create_scheduled_run(
        db=db,
        db_schedule=schedule,
        scheduled_time=datetime.now(timezone.utc),
        triggering_event=TriggeringEvent.MANUAL,
    )

    assert created_run.status == RunFinalResult.PENDING.value

    attempt = asyncio.run(scheduler_service.start_attempt_for_scheduled_run(db, created_run))
    db.refresh(created_run)

    assert attempt is not None
    assert attempt.status == RunStatus.QUEUED.value
    assert created_run.status == RunFinalResult.IN_PROGRESS.value
    assert created_run.log_links.get("run_detail")
    assert created_run.artifact_links.get("artifacts")

    db.close()


def test_scheduled_run_uses_environment_profile_and_target(monkeypatch):
    db = SessionLocal()

    env = db_models.Environment(
        name="Targeted Env",
        description="",
        dbt_target_name="dev",
        connection_profile_reference="analytics",
        variables={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(env)
    db.commit()
    db.refresh(env)

    schedule = db_models.Schedule(
        name="Profiled run",
        description="",
        cron_expression="0 * * * *",
        timezone="UTC",
        dbt_command="run",
        environment_id=env.id,
        notification_config={},
        retry_policy={},
        retention_policy=None,
        catch_up_policy="skip",
        overlap_policy="no_overlap",
        enabled=True,
        status="active",
        next_run_time=datetime.now(timezone.utc),
        last_run_time=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    created_run = scheduler_service.create_scheduled_run(
        db=db,
        db_schedule=schedule,
        scheduled_time=datetime.now(timezone.utc),
        triggering_event=TriggeringEvent.MANUAL,
    )

    captured: dict = {}

    async def fake_start_run(
        command,
        parameters,
        description=None,
        project_path=None,
        run_row_lineage=False,
        artifacts_path=None,
        workspace_id=None,
    ):
        captured.update(parameters)
        return "run-123"

    monkeypatch.setattr(scheduler_service_module.executor, "start_run", fake_start_run)

    attempt = asyncio.run(scheduler_service.start_attempt_for_scheduled_run(db, created_run))

    assert attempt is not None
    assert captured["target"] == "dev"
    assert captured["profile"] == "analytics"

    db.close()


def test_scheduled_run_parameters_persist_in_executor_history():
    db = SessionLocal()
    executor.run_history.clear()
    executor.active_runs.clear()
    executor.run_artifacts.clear()

    env = db_models.Environment(
        name="Integration Env",
        description="",
        dbt_target_name="prod",
        connection_profile_reference="warehouse",
        variables={},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(env)
    db.commit()
    db.refresh(env)

    schedule = db_models.Schedule(
        name="Integration run",
        description="",
        cron_expression="0 * * * *",
        timezone="UTC",
        dbt_command="run",
        environment_id=env.id,
        notification_config={},
        retry_policy={},
        retention_policy=None,
        catch_up_policy="skip",
        overlap_policy="no_overlap",
        enabled=True,
        status="active",
        next_run_time=datetime.now(timezone.utc),
        last_run_time=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    created_run = scheduler_service.create_scheduled_run(
        db=db,
        db_schedule=schedule,
        scheduled_time=datetime.now(timezone.utc),
        triggering_event=TriggeringEvent.MANUAL,
    )

    attempt = asyncio.run(scheduler_service.start_attempt_for_scheduled_run(db, created_run))

    assert attempt is not None
    run_detail = executor.run_history[attempt.run_id]
    assert run_detail.parameters["target"] == "prod"
    assert run_detail.parameters["profile"] == "warehouse"

    db.close()
