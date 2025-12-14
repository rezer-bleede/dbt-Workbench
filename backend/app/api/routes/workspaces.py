from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import Role, WorkspaceContext, get_current_user, get_current_workspace, require_role
from app.core.config import Settings, get_settings
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.database.services import auth_service
from app.schemas.auth import WorkspaceCreate, WorkspaceSummary, WorkspaceUpdate

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _to_summary(workspace: db_models.Workspace) -> WorkspaceSummary:
    return WorkspaceSummary(
        id=workspace.id,
        key=workspace.key,
        name=workspace.name,
        description=workspace.description,
        artifacts_path=workspace.artifacts_path,
    )


@router.get("", response_model=List[WorkspaceSummary])
def list_workspaces(
    current_workspace: WorkspaceContext = Depends(get_current_workspace),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
    user_ctx=Depends(get_current_user),
):
    if not settings.auth_enabled or settings.single_project_mode:
        # In single-project mode, expose only the implicit default workspace
        if current_workspace.id is None:
            return [
                WorkspaceSummary(
                    id=0,
                    key=current_workspace.key,
                    name=current_workspace.name,
                    description=None,
                    artifacts_path=current_workspace.artifacts_path,
                )
            ]

    # When auth is enabled, restrict to workspaces assigned to the current user
    if not settings.auth_enabled or user_ctx.id is None:
        workspaces = auth_service.list_all_workspaces(db)
        return [_to_summary(w) for w in workspaces]

    user = auth_service.get_user(db, user_ctx.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "User not found."},
        )
    workspaces, _ = auth_service.list_workspaces_for_user(db, user)
    return [_to_summary(w) for w in workspaces]


@router.get("/active", response_model=WorkspaceSummary)
def get_active_workspace(
    current_workspace: WorkspaceContext = Depends(get_current_workspace),
):
    return WorkspaceSummary(
        id=current_workspace.id or 0,
        key=current_workspace.key,
        name=current_workspace.name,
        description=None,
        artifacts_path=current_workspace.artifacts_path,
    )


@router.post(
    "",
    response_model=WorkspaceSummary,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def create_workspace(
    payload: WorkspaceCreate,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> WorkspaceSummary:
    if settings.single_project_mode:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "single_project_mode",
                "message": "Multiple workspaces are disabled in single-project mode.",
            },
        )

    existing = auth_service.get_workspace_by_key(db, payload.key)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "workspace_exists",
                "message": f"Workspace with key '{payload.key}' already exists.",
            },
        )

    # Enforce that artifacts_path stays within the configured artifacts root
    root = Path(settings.dbt_artifacts_path).resolve()
    requested_path = Path(payload.artifacts_path).resolve()
    try:
        requested_path.relative_to(root)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_artifacts_path",
                "message": f"artifacts_path must be inside {root}",
            },
        )

    workspace = auth_service.create_workspace(
        db,
        key=payload.key,
        name=payload.name,
        description=payload.description,
        artifacts_path=str(requested_path),
    )
    return _to_summary(workspace)


@router.patch(
    "/{workspace_id}",
    response_model=WorkspaceSummary,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def update_workspace(
    workspace_id: int,
    payload: WorkspaceUpdate,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> WorkspaceSummary:
    workspace = auth_service.get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "workspace_not_found", "message": "Workspace not found."},
        )

    artifacts_path: Optional[str] = payload.artifacts_path
    if artifacts_path is not None:
        root = Path(settings.dbt_artifacts_path).resolve()
        requested_path = Path(artifacts_path).resolve()
        try:
            requested_path.relative_to(root)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "invalid_artifacts_path",
                    "message": f"artifacts_path must be inside {root}",
                },
            )
        artifacts_path = str(requested_path)

    workspace = auth_service.update_workspace(
        db,
        workspace,
        name=payload.name,
        description=payload.description,
        artifacts_path=artifacts_path,
        is_active=payload.is_active,
    )
    return _to_summary(workspace)


@router.delete(
    "/{workspace_id}",
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def delete_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
) -> dict:
    workspace = auth_service.get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "workspace_not_found", "message": "Workspace not found."},
        )
    workspace.is_active = False
    db.add(workspace)
    db.commit()
    return {"status": "ok", "message": "Workspace deactivated"}