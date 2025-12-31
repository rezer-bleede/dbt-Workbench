import asyncio
import datetime
from datetime import timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.connection import Base
from app.database.models import models as db_models
from app.schemas.execution import DbtCommand
from app.schemas.git import GitRepositorySummary
from app.schemas.scheduler import RunFinalResult, RunStatus
from app.services import git_service
from app.services.dbt_executor import executor
from app.services.scheduler_service import scheduler_service


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _make_workspace_and_environment(db):
    workspace = db_models.Workspace(
        key="ws-key",
        name="Workspace",
        description=None,
        artifacts_path="/tmp/artifacts",
        created_at=datetime.datetime.now(timezone.utc),
        updated_at=datetime.datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    env = db_models.Environment(
        name="env",
        description=None,
        dbt_target_name=None,
        connection_profile_reference=None,
        variables={},
        default_retention_policy=None,
        created_at=datetime.datetime.now(timezone.utc),
        updated_at=datetime.datetime.now(timezone.utc),
        workspace_id=workspace.id,
    )
    db.add(env)
    db.commit()
    db.refresh(env)

    return workspace, env


def _make_schedule(db, environment: db_models.Environment) -> db_models.Schedule:
    schedule = db_models.Schedule(
        name="nightly",
        description=None,
        cron_expression="0 0 * * *",
        timezone="UTC",
        dbt_command=DbtCommand.RUN.value,
        environment_id=environment.id,
        notification_config={},
        retry_policy={},
        retention_policy=None,
        catch_up_policy="skip",
        overlap_policy="no_overlap",
        enabled=True,
        status="active",
        next_run_time=None,
        last_run_time=None,
        created_at=datetime.datetime.now(timezone.utc),
        updated_at=datetime.datetime.now(timezone.utc),
        created_by="tester",
        updated_by="tester",
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


def test_resolve_project_path_prefers_workspace_repository(monkeypatch, session, tmp_path):
    workspace, environment = _make_workspace_and_environment(session)
    schedule = _make_schedule(session, environment)

    repo_dir = tmp_path / "repo"
    summary = GitRepositorySummary(
        id=1,
        workspace_id=workspace.id,
        remote_url=None,
        provider=None,
        default_branch="main",
        directory=str(repo_dir),
        last_synced_at=None,
    )

    monkeypatch.setattr(git_service, "get_repository", lambda db, workspace_id: summary)

    resolved = scheduler_service._resolve_project_path(session, schedule)

    assert resolved == str(repo_dir)


def test_start_attempt_uses_workspace_repository_path(monkeypatch, session, tmp_path):
    workspace, environment = _make_workspace_and_environment(session)
    schedule = _make_schedule(session, environment)

    scheduled_run = db_models.ScheduledRun(
        schedule_id=schedule.id,
        triggering_event="manual",
        status=RunFinalResult.SKIPPED.value,
        retry_status="not_applicable",
        attempts_total=0,
        scheduled_at=datetime.datetime.now(timezone.utc),
        queued_at=None,
        started_at=None,
        finished_at=None,
        environment_snapshot={},
        command={},
        log_links={},
        artifact_links={},
    )
    session.add(scheduled_run)
    session.commit()
    session.refresh(scheduled_run)

    repo_dir = tmp_path / "workspace" / "repo"
    summary = GitRepositorySummary(
        id=1,
        workspace_id=workspace.id,
        remote_url=None,
        provider=None,
        default_branch="main",
        directory=str(repo_dir),
        last_synced_at=None,
    )
    monkeypatch.setattr(git_service, "get_repository", lambda db, workspace_id: summary)

    async def _run_attempt():
        # Isolate executor state for the test
        executor.run_history.clear()
        executor.active_runs.clear()
        executor.run_artifacts.clear()

        attempt = await scheduler_service.start_attempt_for_scheduled_run(session, scheduled_run)

        assert attempt is not None
        run_detail = executor.get_run_detail(attempt.run_id)
        assert run_detail is not None
        assert run_detail.project_path == str(repo_dir)
        assert attempt.status == RunStatus.QUEUED.value

    asyncio.run(_run_attempt())
