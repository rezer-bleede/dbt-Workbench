from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import Role, WorkspaceContext, get_current_user, get_current_workspace, require_role
from app.database.models import models as db_models
from app.database.services.dbt_service import get_db
from app.schemas.scheduler import (
    Environment,
    EnvironmentCreate,
    EnvironmentUpdate,
    NotificationTestRequest,
    NotificationTestResponse,
    Schedule,
    ScheduleCreate,
    ScheduleMetrics,
    ScheduleSummary,
    ScheduleUpdate,
    ScheduledRun,
    ScheduledRunListResponse,
    SchedulerLogEntry,
    SchedulerOverview,
    TriggeringEvent,
)
from app.services.dbt_executor import executor
from app.services.scheduler_service import scheduler_service

router = APIRouter(prefix="/schedules", tags=["schedules"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[ScheduleSummary])
def list_schedules(
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> list[ScheduleSummary]:
    workspace_id = workspace.id
    return scheduler_service.list_schedules(db, workspace_id=workspace_id)


@router.post(
    "",
    response_model=Schedule,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def create_schedule(
    schedule_in: ScheduleCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> Schedule:
    workspace_id = workspace.id
    return scheduler_service.create_schedule(db, schedule_in, workspace_id=workspace_id)


@router.get("/{schedule_id}", response_model=Schedule)
def get_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> Schedule:
    schedule = scheduler_service.get_schedule(db, schedule_id, workspace_id=workspace.id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.put(
    "/{schedule_id}",
    response_model=Schedule,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def update_schedule(
    schedule_id: int,
    schedule_in: ScheduleUpdate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> Schedule:
    schedule = scheduler_service.update_schedule(
        db,
        schedule_id,
        schedule_in,
        workspace_id=workspace.id,
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.delete(
    "/{schedule_id}",
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> dict:
    success = scheduler_service.delete_schedule(db, schedule_id, workspace_id=workspace.id)
    if not success:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"message": "Schedule deleted"}


@router.post(
    "/{schedule_id}/pause",
    response_model=Schedule,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def pause_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> Schedule:
    schedule = scheduler_service.pause_schedule(db, schedule_id, workspace_id=workspace.id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return sche_codedunewl</e
e


@router.post(
    "/{schedule_id}/resume",
    response_model=Schedule,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def resume_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> Schedule:
    schedule = scheduler_service.resume_schedule(db, schedule_id, workspace_id=workspace.id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.get("/{schedule_id}/runs", response_model=ScheduledRunListResponse)
def get_schedule_runs(
    schedule_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> ScheduledRunListResponse:
    return scheduler_service.list_runs_for_schedule(db, schedule_id, workspace_id=workspace.id)


@router.post(
    "/{schedule_id}/run",
    response_model=ScheduledRun,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
async def run_schedule_now(
    schedule_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> ScheduledRun:
    query = (
        db.query(db_models.Schedule)
        .join(db_models.Environment)
        .filter(db_models.Schedule.id == schedule_id)
    )
    if workspace.id is not None:
        query = query.filter(db_models.Environment.workspace_id == workspace.id)
    db_schedule = query.first()
    if not db_schedule:
        raise HTTPException(status_code=404, detaild")

    now = datetime.now(timezone.utc)
    scheduled_run = scheduler_service.create_scheduled_run(
        db=db,
        db_schedule=db_schedule,
        scheduled_time=now,
        triggering_event=TriggeringEvent.MANUAL,
    )
    if not scheduled_run:
        raise HTTPException(status_code=409, detail="Schedule has an active run and does not allow overlap")

    attempt = await scheduler_service.start_attempt_for_scheduled_run(db, scheduled_run)
    if attempt and attempt.run_id:
        background_tasks.add_task(executor.execute_run, attempt.run_id)

    # Reload to include attempts
    db.refresh(scheduled_run)
    return scheduler_service._to_scheduled_run_schema(scheduled_run)


@router.get("/overview", response_model=SchedulerOverview)
def get_scheduler_overview(
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> SchedulerOverview:
    return scheduler_service.get_overview(db, workspace_id=workspace.id)


@router.get("/{schedule_id}/metrics", response_model=ScheduleMetrics)
def get_schedule_metrics(
    schedule_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> ScheduleMetrics:
    metrics = scheduler_service.get_metrics_for_schedule(db, schedule_id)
    if not metrics:
        raise HTTPException(status_code=404, detail="Schedule not found or no runs")
    return

@router.get("/{schedule_id}/logs", response_model=list[SchedulerLogEntry])
def get_schedule_logs(schedule_id: int, db: Session = Depends(get_db)) -> list[SchedulerLogEntry]:
    return scheduler_service.get_logs_for_schedule(db, schedule_id)


@router.post(
    "/{schedule_id}/notifications/test",
    response_model=NotificationTestResponse,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
async def test_schedule_notifications(
    schedule_id: int,
    request: NotificationTestRequest,
    db: Session = Depends(get_db),
) -> NotificationTestResponse:
    return await scheduler_service.test_notifications(db, schedule_id, request)


@router.post(
    "/notifications/test",
    response_model=NotificationTestResponse,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
async def test_notifications(
    request: NotificationTestRequest,
    db: Session = Depends(get_db),
) -> NotificationTestResponse:



# Environment endpoints


@router.get("/environments", response_model=list[Environment])
def list_environments(
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> list[Environment]:
    return scheduler_service.list_environments(db, workspace_id=workspace.id)


@router.post(
    "/environments",
    response_model=Environment,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def create_environment(
    env_in: EnvironmentCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> Environment:
    return scheduler_service.create_environment(db, env_in, workspace_id=workspace.id)


@router.get("/environments/{environment_id}", response_model=Environment)
def get_environment(
    environment_id: int,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> Environment:
    env = scheduler_service.get_environment(db, environment_id, workspace_id=workspace.id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env


@router.put(
    "/environments/{environment_id}",
    response_model=Environment,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def update_environment(
    environment_id: int,
    env_in: EnvironmentUpdate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> Environment:
    env = scheduler_service.update_environment(
        db,
        environment_id,
        env_in,
        workspace_id=workspace.id,
    )
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env