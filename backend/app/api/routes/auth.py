from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import (
    Role,
    UserContext,
    create_access_token,
    create_refresh_token,
    get_current_user,
    require_role,
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
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeySummary,
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


@router.post("/api-keys", response_model=ApiKeyCreated, dependencies=[Depends(require_role(Role.ADMIN))])
def create_api_key(
    payload: ApiKeyCreate,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> ApiKeyCreated:
    if not settings.auth_enabled:
        raise HTTPException(status_code=400, detail="Enable AUTH_ENABLED to manage API keys.")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="API key name cannot be blank.")
    workspace_ids = list(dict.fromkeys(payload.workspace_ids))
    active_ids = {
        row[0]
        for row in db.query(db_models.Workspace.id)
        .filter(db_models.Workspace.id.in_(workspace_ids), db_models.Workspace.is_active.is_(True))
        .all()
    }
    if active_ids != set(workspace_ids):
        raise HTTPException(status_code=400, detail="workspace_ids must contain only active workspaces.")

    raw_key = f"dbw_{secrets.token_urlsafe(32)}"
    key = db_models.ApiKey(
        name=name,
        key_prefix=f"{raw_key[:12]}…",
        key_hash=hashlib.sha256(raw_key.encode()).hexdigest(),
        role=payload.role.value,
        workspace_ids=workspace_ids,
        created_at=datetime.now(timezone.utc),
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return ApiKeyCreated(
        id=key.id,
        name=key.name,
        key_prefix=key.key_prefix,
        role=Role(key.role),
        workspace_ids=key.workspace_ids,
        created_at=key.created_at,
        last_used_at=key.last_used_at,
        revoked_at=key.revoked_at,
        key=raw_key,
    )


@router.get("/api-keys", response_model=list[ApiKeySummary], dependencies=[Depends(require_role(Role.ADMIN))])
def list_api_keys(
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> list[ApiKeySummary]:
    if not settings.auth_enabled:
        raise HTTPException(status_code=400, detail="Enable AUTH_ENABLED to manage API keys.")
    keys = db.query(db_models.ApiKey).order_by(db_models.ApiKey.id).all()
    return [
        ApiKeySummary(
            id=key.id,
            name=key.name,
            key_prefix=key.key_prefix,
            role=Role(key.role),
            workspace_ids=key.workspace_ids or [],
            created_at=key.created_at,
            last_used_at=key.last_used_at,
            revoked_at=key.revoked_at,
        )
        for key in keys
    ]


@router.delete("/api-keys/{key_id}", dependencies=[Depends(require_role(Role.ADMIN))])
def revoke_api_key(
    key_id: int,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> dict:
    if not settings.auth_enabled:
        raise HTTPException(status_code=400, detail="Enable AUTH_ENABLED to manage API keys.")
    key = db.query(db_models.ApiKey).filter(db_models.ApiKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found.")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": "revoked", "id": key.id}
