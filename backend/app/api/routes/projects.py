from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceContext, get_current_user, get_current_workspace
from app.core.config import Settings, get_settings
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.database.services import auth_service
from app.schemas.responses import Project
from app.services.artifact_service import ArtifactService
from app.core.watcher_manager import get_watcher

router = APIRouter(dependencies=[Depends(get_current_user)])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/projects", response_model=List[Project])
def list_projects(
    workspace: WorkspaceContext = Depends(get_current_workspace),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
    user_ctx=Depends(get_current_user),
) -> List[Project]:
    """List all accessible projects (workspaces) with basic status information."""
    # Determine visible workspaces (mirror /workspaces endpoint semantics)
    if not settings.auth_enabled or settings.single_project_mode:
        workspaces = auth_service.list_all_workspaces(db)
    else:
        if user_ctx.id is None:
            workspaces = auth_service.list_all_workspaces(db)
        else:
            user = auth_service.get_user(db, user_ctx.id)
            if not user:
                workspaces = []
            else:
                workspaces, _ = auth_service.list_workspaces_for_user(db, user)

    projects: List[Project] = []

    for ws in workspaces:
        artifacts_path = ws.artifacts_path or settings.dbt_artifacts_path

        # Artifact status via ArtifactService
        artifact_service = ArtifactService(artifacts_path)
        summary = artifact_service.get_artifact_summary()
        if any(summary.values()):
            status = "ready" if summary.get("manifest") else "partial"
        else:
            status = "empty"

        # Last activity: latest run timestamp or latest artifact update
        last_activity: Optional[datetime] = None

        latest_run = (
            db.query(db_models.Run)
            .filter(db_models.Run.workspace_id == ws.id)
            .order_by(db_models.Run.timestamp.desc())
            .first()
        )
        if latest_run and latest_run.timestamp:
            last_activity = latest_run.timestamp

        watcher = get_watcher(artifacts_path)
        version_info = watcher.get_version_info()
        for info in version_info.values():
            ts = info.get("timestamp")
            if ts:
                try:
                    ts_dt = datetime.fromisoformat(ts)
                except Exception:
                    continue
                if last_activity is None or ts_dt > last_activity:
                    last_activity = ts_dt

        projects.append(
            Project(
                id=str(ws.id),
                name=ws.name,
                key=ws.key,
                artifacts_path=artifacts_path,
                status=status,
                last_activity=last_activity,
                is_active=(ws.id == workspace.id),
            )
        )

    # In single-project bootstrap scenarios, there may not yet be a persisted workspace
    if not projects and workspace.id is None:
        projects.append(
            Project(
                id=str(workspace.key),
                name=workspace.name,
                key=workspace.key,
                artifacts_path=workspace.artifacts_path,
                status=None,
                last_activity=None,
                is_active=True,
            )
        )

    return projects
