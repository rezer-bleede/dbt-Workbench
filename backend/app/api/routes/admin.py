from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import Role, require_role
from app.core.config import get_settings
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.database.services import auth_service
from app.schemas.auth import UserCreate, UserSummary, UserUpdate, WorkspaceSummary

router = APIRouter(prefix="/admin", tags=["admin"])


def get_db() -> Session:
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


def _to_workspace_summary(workspace: db_models.Workspace) -> WorkspaceSummary:
    return WorkspaceSummary(
        id=workspace.id,
        key=workspace.key,
        name=workspace.name,
        description=workspace.description,
        artifacts_path=workspace.artifacts_path,
    )


def _to_user_summary(user: db_models.User, db: Session) -> UserSummary:
    workspaces, default_workspace = auth_service.list_workspaces_for_user(db, user)
    default_id = default_workspace.id if default_workspace else None
    return UserSummary(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=Role(user.role),
        is_active=user.is_active,
        workspaces=[_to_workspace_summary(w) for w in workspaces],
        default_workspace_id=default_id,
    )


@router.get(
    "/users",
    response_model=List[UserSummary],
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def list_users(db: Session = Depends(get_db)) -> List[UserSummary]:
    users = auth_service.list_users(db)
    return [_to_user_summary(u, db) for u in users]


@router.post(
    "/users",
    response_model=UserSummary,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
) -> UserSummary:
    settings = get_settings()

    if len(payload.password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_password",
                "message": "Password does not meet minimum length requirements.",
            },
        )

    existing = auth_service.get_user_by_username(db, payload.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "user_exists",
                "message": f"User '{payload.username}' already exists.",
            },
        )

    user = auth_service.create_user(
        db,
        username=payload.username,
        password=payload.password,
        role=payload.role,
        full_name=payload.full_name,
    )

    if payload.workspace_ids:
        auth_service.set_user_workspaces(
            db,
            user,
            workspace_ids=payload.workspace_ids,
            default_workspace_id=payload.default_workspace_id,
        )

    return _to_user_summary(user, db)


@router.patch(
    "/users/{user_id}",
    response_model=UserSummary,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
) -> UserSummary:
    user = auth_service.get_user(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "User not found."},
        )

    if payload.role is not None:
        user.role = payload.role.value
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.is_active is not None:
        user.is_active = payload.is_active

    if payload.password is not None:
        user = auth_service.set_user_password(db, user, payload.password)
    else:
        db.add(user)
        db.commit()

    if payload.workspace_ids is not None:
        auth_service.set_user_workspaces(
            db,
            user,
            workspace_ids=payload.workspace_ids,
            default_workspace_id=payload.default_workspace_id,
        )

    return _to_user_summary(user, db)