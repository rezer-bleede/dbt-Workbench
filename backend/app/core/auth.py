from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.database.connection import SessionLocal
from app.database.models import models as db_models


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


class Role(str, Enum):
    VIEWER = "viewer"
    DEVELOPER = "developer"
    ADMIN = "admin"


ROLE_ORDER: Dict[Role, int] = {
    Role.VIEWER: 0,
    Role.DEVELOPER: 1,
    Role.ADMIN: 2,
}


@dataclass
class UserContext:
    id: Optional[int]
    username: Optional[str]
    role: Role
    workspace_ids: List[int]
    active_workspace_id: Optional[int]
    auth_enabled: bool


@dataclass
class WorkspaceContext:
    id: Optional[int]
    key: str
    name: str
    artifacts_path: str


# Password utilities


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# Token utilities


def _create_token(
    data: Dict[str, Any],
    settings: Settings,
    expires_delta: timedelta,
) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(
    subject: str,
    settings: Settings,
    role: Role,
    workspace_ids: List[int],
    active_workspace_id: Optional[int],
) -> str:
    payload = {
        "sub": subject,
        "role": role.value,
        "workspaces": workspace_ids,
        "active_workspace": active_workspace_id,
        "type": "access",
    }
    return _create_token(
        payload,
        settings=settings,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(
    subject: str,
    settings: Settings,
    role: Role,
    workspace_ids: List[int],
    active_workspace_id: Optional[int],
) -> str:
    payload = {
        "sub": subject,
        "role": role.value,
        "workspaces": workspace_ids,
        "active_workspace": active_workspace_id,
        "type": "refresh",
    }
    return _create_token(
        payload,
        settings=settings,
        expires_delta=timedelta(minutes=settings.refresh_token_expire_minutes),
    )


def decode_token(token: str, settings: Settings) -> Dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "invalid_token",
                "message": "Could not validate credentials",
            },
        ) from exc


# DB session helper


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Current user / workspace dependencies


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    settings: Settings = Depends(get_settings),
) -> UserContext:
    if not settings.auth_enabled:
        return UserContext(
            id=None,
            username=None,
            role=Role.ADMIN,
            workspace_ids=[],
            active_workspace_id=None,
            auth_enabled=False,
        )

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": "authentication_required",
                "message": "Authentication credentials were not provided.",
            },
        )

    payload = decode_token(token, settings)
    token_type = payload.get("type")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid token type."},
        )

    subject = payload.get("sub")
    role_value = payload.get("role")
    if subject is None or role_value is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Malformed token payload."},
        )

    try:
        role = Role(role_value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Unknown role in token."},
        )

    workspace_ids = payload.get("workspaces") or []
    active_workspace_id = payload.get("active_workspace")

    user_id: Optional[int] = None
    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        user_id = None

    return UserContext(
        id=user_id,
        username=None,
        role=role,
        workspace_ids=list(workspace_ids),
        active_workspace_id=active_workspace_id,
        auth_enabled=True,
    )


async def get_current_workspace(
    current_user: UserContext = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> WorkspaceContext:
    if settings.single_project_mode or not settings.auth_enabled:
        workspace = (
            db.query(db_models.Workspace)
            .filter(db_models.Workspace.key == settings.default_workspace_key, db_models.Workspace.is_active.is_(True))
            .first()
        )
        if not workspace:
            workspace = db_models.Workspace(
                key=settings.default_workspace_key,
                name=settings.default_workspace_name,
                description=settings.default_workspace_description,
                artifacts_path=settings.dbt_artifacts_path,
                is_active=True,
            )
            db.add(workspace)
            db.commit()
            db.refresh(workspace)

        return WorkspaceContext(
            id=workspace.id,
            key=workspace.key,
            name=workspace.name,
            artifacts_path=workspace.artifacts_path,
        )

    active_id = current_user.active_workspace_id
    if active_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "workspace_not_selected",
                "message": "No active workspace selected.",
            },
        )

    if current_user.workspace_ids and active_id not in current_user.workspace_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "forbidden",
                "message": "You do not have access to the selected workspace.",
            },
        )

    workspace = db.query(db_models.Workspace).filter(
        db_models.Workspace.id == active_id,
        db_models.Workspace.is_active.is_(True),
    ).first()
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "workspace_not_found", "message": "Workspace not found."},
        )

    return WorkspaceContext(
        id=workspace.id,
        key=workspace.key,
        name=workspace.name,
        artifacts_path=workspace.artifacts_path,
    )


def require_role(required: Role):
    async def dependency(
        current_user: UserContext = Depends(get_current_user),
        settings: Settings = Depends(get_settings),
    ) -> None:
        if not settings.auth_enabled:
            return

        current_level = ROLE_ORDER.get(current_user.role, -1)
        required_level = ROLE_ORDER.get(required, -1)
        if current_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "forbidden",
                    "message": "You do not have permission to perform this action.",
                    "required_role": required.value,
                    "current_role": current_user.role.value,
                },
            )

    return dependency
