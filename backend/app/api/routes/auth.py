from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import (
    Role,
    UserContext,
    WorkspaceContext,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_current_workspace,
)
from app.core.config import Settings, get_settings
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.database.services import auth_service
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    TokenResponse,
    UserSummary,
    WorkspaceSummary,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _to_workspace_summary(workspace: db_models.Workspace) -> WorkspaceSummary:
    return WorkspaceSummary(
        id=workspace.id,
        key=workspace.key,
        name=workspace.name,
        description=workspace.description,
        artifacts_path=workspace.artifacts_path,
    )


def _to_user_summary(
    user: db_models.User,
    workspaces: List[db_models.Workspace],
    default_workspace: Optional[db_models.Workspace],
) -> UserSummary:
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


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> LoginResponse:
    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "auth_disabled",
                "message": "Authentication is disabled by configuration.",
            },
        )

    user = auth_service.authenticate_user(db, payload.username, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_credentials", "message": "Invalid username or password."},
        )

    workspaces, default_workspace = auth_service.list_workspaces_for_user(db, user)
    workspace_ids = [w.id for w in workspaces]
    active_workspace = default_workspace

    access_token = create_access_token(
        subject=str(user.id),
        settings=settings,
        role=Role(user.role),
        workspace_ids=workspace_ids,
        active_workspace_id=active_workspace.id if active_workspace else None,
    )
    refresh_token = create_refresh_token(
        subject=str(user.id),
        settings=settings,
        role=Role(user.role),
        workspace_ids=workspace_ids,
        active_workspace_id=active_workspace.id if active_workspace else None,
    )

    user_summary = _to_user_summary(user, workspaces, default_workspace)
    active_workspace_summary = (
        _to_workspace_summary(active_workspace) if active_workspace else None
    )

    return LoginResponse(
        tokens=TokenResponse(access_token=access_token, refresh_token=refresh_token),
        user=user_summary,
        active_workspace=active_workspace_summary,
    )


@router.post("/refresh", response_model=LoginResponse)
def refresh(
    payload: RefreshRequest,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> LoginResponse:
    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "auth_disabled",
                "message": "Authentication is disabled by configuration.",
            },
        )

    from app.core.auth import decode_token  # local import to avoid cycles

    token_data = decode_token(payload.refresh_token, settings)
    if token_data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid token type."},
        )

    subject = token_data.get("sub")
    role_value = token_data.get("role")
    workspace_ids = token_data.get("workspaces") or []
    active_workspace_id = token_data.get("active_workspace")

    try:
        role = Role(role_value)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid role in token."},
        )

    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid subject in token."},
        )

    user = auth_service.get_user(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "User no longer exists or is inactive."},
        )

    workspaces, default_workspace = auth_service.list_workspaces_for_user(db, user)
    if not workspaces:
        workspace_ids = []
        active_workspace = None
    else:
        workspace_ids = [w.id for w in workspaces]
        if active_workspace_id and any(w.id == active_workspace_id for w in workspaces):
            active_workspace = next(w for w in workspaces if w.id == active_workspace_id)
        else:
            active_workspace = default_workspace or workspaces[0]

    access_token = create_access_token(
        subject=str(user.id),
        settings=settings,
        role=role,
        workspace_ids=workspace_ids,
        active_workspace_id=active_workspace.id if active_workspace else None,
    )
    refresh_token = create_refresh_token(
        subject=str(user.id),
        settings=settings,
        role=role,
        workspace_ids=workspace_ids,
        active_workspace_id=active_workspace.id if active_workspace else None,
    )

    user_summary = _to_user_summary(user, workspaces, active_workspace)
    active_workspace_summary = (
        _to_workspace_summary(active_workspace) if active_workspace else None
    )

    return LoginResponse(
        tokens=TokenResponse(access_token=access_token, refresh_token=refresh_token),
        user=user_summary,
        active_workspace=active_workspace_summary,
    )


@router.post("/logout")
def logout() -> dict:
    return {
        "status": "ok",
        "detail": {
            "message": "Logged out. Please discard tokens on the client.",
            "code": "logout_success",
        },
    }


@router.post("/switch-workspace", response_model=LoginResponse)
def switch_workspace(
    workspace_id: int,
    current_user: UserContext = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> LoginResponse:
    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "auth_disabled",
                "message": "Authentication is disabled by configuration.",
            },
        )

    if current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_user", "message": "Anonymous user cannot switch workspace."},
        )

    user = auth_service.get_user(db, current_user.id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_user", "message": "User not found or inactive."},
        )

    workspaces, default_workspace = auth_service.list_workspaces_for_user(db, user)
    if not any(w.id == workspace_id for w in workspaces):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "forbidden",
                "message": "You do not have access to the requested workspace.",
            },
        )

    active_workspace = next(w for w in workspaces if w.id == workspace_id)

    workspace_ids = [w.id for w in workspaces]
    role = Role(user.role)

    access_token = create_access_token(
        subject=str(user.id),
        settings=settings,
        role=role,
        workspace_ids=workspace_ids,
        active_workspace_id=active_workspace.id,
    )
    refresh_token = create_refresh_token(
        subject=str(user.id),
        settings=settings,
        role=role,
        workspace_ids=workspace_ids,
        active_workspace_id=active_workspace.id,
    )

    user_summary = _to_user_summary(user, workspaces, active_workspace)
    active_workspace_summary = _to_workspace_summary(active_workspace)

    return LoginResponse(
        tokens=TokenResponse(access_token=access_token, refresh_token=refresh_token),
        user=user_summary,
        active_workspace=active_workspace_summary,
    )


@router.get("/me", response_model=UserSummary)
def me(
    current_user: UserContext = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> UserSummary:
    if not settings.auth_enabled or current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "auth_disabled",
                "message": "Authentication is disabled or user is anonymous.",
            },
        )

    user = auth_service.get_user(db, current_user.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "user_not_found", "message": "User not found."},
        )

    workspaces, default_workspace = auth_service.list_workspaces_for_user(db, user)
    return _to_user_summary(user, workspaces, default_workspace)