from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.auth import Role, get_password_hash, verify_password
from app.database.models import models as db_models


def get_user_by_username(db: Session, username: str) -> Optional[db_models.User]:
    return db.query(db_models.User).filter(db_models.User.username == username).first()


def get_user(db: Session, user_id: int) -> Optional[db_models.User]:
    return db.query(db_models.User).filter(db_models.User.id == user_id).first()


def list_users(db: Session) -> List[db_models.User]:
    return db.query(db_models.User).order_by(db_models.User.id).all()


def create_user(
    db: Session,
    *,
    username: str,
    password: str,
    role: Role,
    full_name: Optional[str] = None,
) -> db_models.User:
    now = datetime.now(timezone.utc)
    user = db_models.User(
        username=username,
        full_name=full_name,
        hashed_password=get_password_hash(password),
        role=role.value,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def set_user_password(db: Session, user: db_models.User, password: str) -> db_models.User:
    user.hashed_password = get_password_hash(password)
    user.updated_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, username: str, password: str) -> Optional[db_models.User]:
    user = get_user_by_username(db, username)
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def list_workspaces_for_user(
    db: Session,
    user: db_models.User,
) -> Tuple[List[db_models.Workspace], Optional[db_models.Workspace]]:
    links = (
        db.query(db_models.UserWorkspace)
        .filter(db_models.UserWorkspace.user_id == user.id)
        .all()
    )
    workspace_ids = [link.workspace_id for link in links]
    if not workspace_ids:
        return [], None
    workspaces = (
        db.query(db_models.Workspace)
        .filter(db_models.Workspace.id.in_(workspace_ids), db_models.Workspace.is_active.is_(True))
        .all()
    )
    default_workspace = None
    for link in links:
        if link.is_default:
            default_workspace = next((w for w in workspaces if w.id == link.workspace_id), None)
            if default_workspace:
                break
    if default_workspace is None and workspaces:
        default_workspace = workspaces[0]
    return workspaces, default_workspace


def list_all_workspaces(db: Session) -> List[db_models.Workspace]:
    return (
        db.query(db_models.Workspace)
        .filter(db_models.Workspace.is_active.is_(True))
        .order_by(db_models.Workspace.id)
        .all()
    )


def get_workspace(db: Session, workspace_id: int) -> Optional[db_models.Workspace]:
    return (
        db.query(db_models.Workspace)
        .filter(db_models.Workspace.id == workspace_id, db_models.Workspace.is_active.is_(True))
        .first()
    )


def get_workspace_by_key(db: Session, key: str) -> Optional[db_models.Workspace]:
    return (
        db.query(db_models.Workspace)
        .filter(db_models.Workspace.key == key, db_models.Workspace.is_active.is_(True))
        .first()
    )


def create_workspace(
    db: Session,
    *,
    key: str,
    name: str,
    description: Optional[str],
    artifacts_path: str,
) -> db_models.Workspace:
    now = datetime.now(timezone.utc)
    workspace = db_models.Workspace(
        key=key,
        name=name,
        description=description,
        artifacts_path=artifacts_path,
        created_at=now,
        updated_at=now,
        is_active=True,
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def update_workspace(
    db: Session,
    workspace: db_models.Workspace,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
    artifacts_path: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> db_models.Workspace:
    if name is not None:
        workspace.name = name
    if description is not None:
        workspace.description = description
    if artifacts_path is not None:
        workspace.artifacts_path = artifacts_path
    if is_active is not None:
        workspace.is_active = is_active
    workspace.updated_at = datetime.now(timezone.utc)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def set_user_workspaces(
    db: Session,
    user: db_models.User,
    workspace_ids: Iterable[int],
    default_workspace_id: Optional[int],
) -> None:
    db.query(db_models.UserWorkspace).filter(db_models.UserWorkspace.user_id == user.id).delete()
    for wid in workspace_ids:
        link = db_models.UserWorkspace(
            user_id=user.id,
            workspace_id=wid,
            is_default=default_workspace_id == wid,
        )
        db.add(link)
    db.commit()