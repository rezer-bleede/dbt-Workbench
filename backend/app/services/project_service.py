from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.models import models as db_models
from app.database.services import auth_service
from app.services import git_service


def ensure_default_project(db: Session) -> db_models.Workspace:
    """Ensure a default workspace and local git repository exist for first-time users."""
    settings = get_settings()

    workspace = auth_service.get_workspace_by_key(db, settings.default_workspace_key)
    if not workspace:
        workspace = auth_service.create_workspace(
            db,
            key=settings.default_workspace_key,
            name=settings.default_workspace_name,
            description=settings.default_workspace_description,
            artifacts_path=settings.dbt_artifacts_path,
        )

    Path(workspace.artifacts_path).mkdir(parents=True, exist_ok=True)
    repo_record = (
        db.query(db_models.GitRepository)
        .filter(db_models.GitRepository.workspace_id == workspace.id)
        .first()
    )

    repo_path = Path(settings.git_repos_base_path) / workspace.key
    repo_path.mkdir(parents=True, exist_ok=True)

    if repo_record and (repo_path / ".git").exists():
        return workspace

    git_service.connect_repository(
        db,
        workspace_id=workspace.id,
        remote_url=None,
        branch=repo_record.default_branch if repo_record else "main",
        directory=str(repo_path),
        provider="local",
        user_id=None,
        username=None,
    )
    return workspace
