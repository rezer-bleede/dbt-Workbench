from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import yaml
from fastapi import HTTPException, status
from git import Repo
from git.exc import GitCommandError, InvalidGitRepositoryError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.models import models as db_models
from app.database.services import auth_service
from app.schemas.git import (
    AuditRecord,
    BranchSummary,
    CreateFileRequest,
    DeleteFileRequest,
    FileContent,
    FileNode,
    FileChange,
    GitDiff,
    GitHistoryEntry,
    GitRepositorySummary,
    GitStatusResponse,
    PullRequest,
    PushRequest,
    ValidationResult,
    WriteFileRequest,
)
from app.services import audit_service


CRITICAL_FILES = {
    "dbt_project.yml",
    "profiles.yml",
    "packages.yml",
    "selectors.yml",
    "manifest.json",
}


def _workspace_root(settings, workspace: db_models.Workspace) -> Path:
    root = Path(settings.git_repos_base_path).joinpath(workspace.key).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _assert_within_root(root: Path, candidate: Path) -> None:
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "forbidden_path", "message": "Path must stay within the project workspace."},
        ) from exc


def _safe_path(root: Path, relative: str) -> Path:
    target = (root / relative).resolve()
    _assert_within_root(root, target)
    return target


def _resolve_workspace(db: Session, workspace_id: int | None) -> db_models.Workspace:
    settings = get_settings()

    if workspace_id not in (None, 0):
        workspace = auth_service.get_workspace(db, workspace_id)
        if workspace:
            return workspace

    if settings.single_project_mode or workspace_id in (None, 0):
        workspace = auth_service.get_workspace_by_key(db, settings.default_workspace_key)
        if workspace:
            return workspace
        return auth_service.create_workspace(
            db,
            key=settings.default_workspace_key,
            name=settings.default_workspace_name,
            description=settings.default_workspace_description,
            artifacts_path=settings.dbt_artifacts_path,
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"error": "workspace_not_found", "message": "Workspace not found."},
    )


def _ensure_repo(path: str) -> Repo:
    path_obj = Path(path)
    if not path_obj.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "git_not_configured", "message": "Repository connection not configured."},
        )
    try:
        return Repo(path_obj)
    except InvalidGitRepositoryError as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "not_a_repository", "message": f"{path} is not a git repository."},
        ) from exc


def _get_or_create_repo_record(
    db: Session, workspace_id: int, *, remote_url: str, branch: str, directory: str, provider: Optional[str]
) -> db_models.GitRepository:
    record = (
        db.query(db_models.GitRepository)
        .filter(db_models.GitRepository.workspace_id == workspace_id)
        .first()
    )
    if record:
        record.remote_url = remote_url
        record.default_branch = branch
        record.directory = directory
        record.provider = provider
    else:
        record = db_models.GitRepository(
            workspace_id=workspace_id,
            remote_url=remote_url,
            default_branch=branch,
            directory=directory,
            provider=provider,
        )
        db.add(record)
    db.commit()
    db.refresh(record)
    return record


def connect_repository(
    db: Session,
    *,
    workspace_id: int,
    remote_url: str,
    branch: str,
    directory: Optional[str],
    provider: Optional[str],
    user_id: int | None,
    username: str | None,
) -> GitRepositorySummary:
    settings = get_settings()
    workspace = _resolve_workspace(db, workspace_id)
    resolved_workspace_id = workspace.id

    if directory:
        target_path = Path(directory).resolve()
        _assert_within_root(_workspace_root(settings, workspace), target_path)
    else:
        target_path = _workspace_root(settings, workspace)

    target_path.mkdir(parents=True, exist_ok=True)

    if not (target_path / ".git").exists():
        Repo.clone_from(remote_url, target_path, branch=branch)
    repo = _ensure_repo(str(target_path))
    repo.git.checkout(branch)

    record = _get_or_create_repo_record(
        db,
        workspace_id=resolved_workspace_id,
        remote_url=remote_url,
        branch=branch,
        directory=str(target_path),
        provider=provider,
    )
    record.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    audit_service.record_audit(
        db,
        workspace_id=resolved_workspace_id,
        user_id=user_id,
        username=username,
        action="connect_repository",
        resource="git",
        metadata={"remote_url": remote_url, "branch": branch},
    )

    return GitRepositorySummary.model_validate(record)


def _repo_record(db: Session, workspace_id: int) -> db_models.GitRepository:
    settings = get_settings()
    record = (
        db.query(db_models.GitRepository)
        .filter(db_models.GitRepository.workspace_id == workspace_id)
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "git_not_configured", "message": "Repository connection not configured."},
        )
    workspace = _resolve_workspace(db, workspace_id)
    _assert_within_root(_workspace_root(settings, workspace), Path(record.directory).resolve())
    return record


def get_repository(db: Session, workspace_id: int) -> GitRepositorySummary | None:
    """Get the currently connected repository for a workspace, or None if not configured."""
    record = (
        db.query(db_models.GitRepository)
        .filter(db_models.GitRepository.workspace_id == workspace_id)
        .first()
    )
    if not record:
        return None
    return GitRepositorySummary.model_validate(record)


def disconnect_repository(
    db: Session,
    workspace_id: int,
    *,
    delete_files: bool = False,
    user_id: int | None,
    username: str | None,
) -> None:
    """Disconnect the repository from the workspace. Optionally delete cloned files."""
    record = (
        db.query(db_models.GitRepository)
        .filter(db_models.GitRepository.workspace_id == workspace_id)
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "git_not_configured", "message": "No repository to disconnect."},
        )

    directory = record.directory
    db.delete(record)
    db.commit()

    if delete_files and directory:
        import shutil
        workspace = _resolve_workspace(db, workspace_id)
        dir_path = Path(directory).resolve()
        _assert_within_root(_workspace_root(get_settings(), workspace), dir_path)
        if dir_path.exists():
            shutil.rmtree(dir_path)

    audit_service.record_audit(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        username=username,
        action="disconnect_repository",
        resource="git",
        metadata={"directory": directory, "delete_files": delete_files},
    )


def _categorize(path: Path, base: Path) -> Optional[str]:
    parts = path.relative_to(base).parts
    if not parts:
        return None
    top = parts[0]
    mapping = {
        "models": "models",
        "macros": "macros",
        "tests": "tests",
        "seeds": "seeds",
        "snapshots": "snapshots",
    }
    return mapping.get(top, "configs" if path.suffix in {".yml", ".yaml", ".json"} else None)


def _build_tree(base_path: Path) -> List[FileNode]:
    nodes: List[FileNode] = []
    for root, dirs, files in os.walk(base_path):
        dirs[:] = [d for d in dirs if not d.startswith(".git")]
        rel_root = Path(root).relative_to(base_path)
        for file in files:
            full_path = Path(root) / file
            rel_path = full_path.relative_to(base_path)
            nodes.append(
                FileNode(
                    name=file,
                    path=str(rel_path),
                    type="file",
                    children=None,
                    category=_categorize(full_path, base_path),
                )
            )
    return nodes


def get_status(db: Session, workspace_id: int) -> GitStatusResponse:
    try:
        record = _repo_record(db, workspace_id)
        repo = _ensure_repo(record.directory)
    except HTTPException as exc:
        detail = getattr(exc, "detail", {}) or {}
        if exc.status_code == status.HTTP_404_NOT_FOUND and detail.get("error") == "git_not_configured":
            # Graceful response when repository is not yet connected
            return GitStatusResponse(
                branch="not_configured",
                is_clean=True,
                ahead=0,
                behind=0,
                changes=[],
                has_conflicts=False,
                configured=False,
            )
        raise
    branch_name = repo.active_branch.name

    ahead = behind = 0
    try:
        ahead_output = repo.git.rev_list("--left-right", "--count", f"origin/{branch_name}...{branch_name}")
        ahead, behind = [int(val) for val in ahead_output.split()]
    except Exception:
        ahead = behind = 0

    changes: List[FileChange] = []
    for diff in repo.index.diff(None):
        changes.append(FileChange(path=diff.a_path, change_type="modified", staged=False))
    for diff in repo.index.diff("HEAD"):
        changes.append(FileChange(path=diff.a_path, change_type="staged", staged=True))
    for untracked in repo.untracked_files:
        changes.append(FileChange(path=untracked, change_type="untracked", staged=False))

    has_conflicts = repo.index.unmerged_blobs() != {}

    return GitStatusResponse(
        branch=branch_name,
        is_clean=not repo.is_dirty(untracked_files=True),
        ahead=ahead,
        behind=behind,
        changes=changes,
        has_conflicts=has_conflicts,
        configured=True,
    )


def list_branches(db: Session, workspace_id: int) -> List[BranchSummary]:
    record = _repo_record(db, workspace_id)
    repo = _ensure_repo(record.directory)
    active = repo.active_branch.name
    return [BranchSummary(name=branch.name, is_active=branch.name == active) for branch in repo.branches]


def pull(db: Session, workspace_id: int, request: PullRequest, *, user_id: int | None, username: str | None) -> GitStatusResponse:
    record = _repo_record(db, workspace_id)
    repo = _ensure_repo(record.directory)
    remote = repo.remote(request.remote_name)
    try:
        remote.pull(request.branch or repo.active_branch.name)
    except GitCommandError as exc:  # pragma: no cover - passthrough errors
        raise HTTPException(status_code=400, detail={"error": "pull_failed", "message": str(exc)})
    record.last_synced_at = datetime.now(timezone.utc)
    db.commit()

    audit_service.record_audit(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        username=username,
        action="pull",
        resource="git",
        metadata={"remote": request.remote_name},
    )
    return get_status(db, workspace_id)


def push(db: Session, workspace_id: int, request: PushRequest, *, user_id: int | None, username: str | None) -> GitStatusResponse:
    record = _repo_record(db, workspace_id)
    repo = _ensure_repo(record.directory)
    remote = repo.remote(request.remote_name)
    branch = request.branch or repo.active_branch.name
    try:
        remote.push(branch)
    except GitCommandError as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail={"error": "push_failed", "message": str(exc)})

    audit_service.record_audit(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        username=username,
        action="push",
        resource="git",
        metadata={"remote": request.remote_name, "branch": branch},
    )
    return get_status(db, workspace_id)


def commit_changes(db: Session, workspace_id: int, message: str, files: Optional[List[str]], *, user_id: int | None, username: str | None) -> str:
    record = _repo_record(db, workspace_id)
    repo = _ensure_repo(record.directory)
    if files:
        repo.git.add(files)
    else:
        repo.git.add(A=True)
    commit = repo.index.commit(message)
    audit_service.record_audit(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        username=username,
        action="commit",
        resource="git",
        metadata={"message": message, "files": files or "all"},
        commit_hash=commit.hexsha,
    )
    return commit.hexsha


def switch_branch(db: Session, workspace_id: int, branch: str, *, user_id: int | None, username: str | None) -> GitStatusResponse:
    record = _repo_record(db, workspace_id)
    repo = _ensure_repo(record.directory)
    try:
        repo.git.checkout(branch)
    except GitCommandError as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail={"error": "branch_checkout_failed", "message": str(exc)})

    audit_service.record_audit(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        username=username,
        action="switch_branch",
        resource="git",
        metadata={"branch": branch},
    )
    return get_status(db, workspace_id)


def list_files(db: Session, workspace_id: int) -> List[FileNode]:
    record = _repo_record(db, workspace_id)
    workspace = _resolve_workspace(db, workspace_id)
    workspace_root = _workspace_root(get_settings(), workspace)
    repo_path = Path(record.directory).resolve()
    _assert_within_root(workspace_root, repo_path)
    return _build_tree(repo_path)


def read_file(db: Session, workspace_id: int, path: str) -> FileContent:
    record = _repo_record(db, workspace_id)
    workspace = _resolve_workspace(db, workspace_id)
    workspace_root = _workspace_root(get_settings(), workspace)
    repo_path = Path(record.directory).resolve()
    _assert_within_root(workspace_root, repo_path)
    full_path = _safe_path(repo_path, path)
    if not full_path.exists():
        raise HTTPException(status_code=404, detail={"error": "file_not_found", "message": path})
    content = full_path.read_text(encoding="utf-8")
    readonly = full_path.name == "manifest.json"
    return FileContent(path=path, content=content, readonly=readonly)


def validate_file(path: Path, content: str) -> ValidationResult:
    errors: List[str] = []
    if path.suffix in {".yml", ".yaml"}:
        try:
            yaml.safe_load(content)
        except yaml.YAMLError as exc:
            errors.append(str(exc))
    if path.name == "manifest.json":
        errors.append("manifest.json is read-only unless explicitly enabled")
    return ValidationResult(path=str(path), is_valid=len(errors) == 0, errors=errors)


def write_file(
    db: Session,
    workspace_id: int,
    request: WriteFileRequest,
    *,
    user_id: int | None,
    username: str | None,
) -> ValidationResult:
    record = _repo_record(db, workspace_id)
    workspace = _resolve_workspace(db, workspace_id)
    workspace_root = _workspace_root(get_settings(), workspace)
    repo_path = Path(record.directory).resolve()
    _assert_within_root(workspace_root, repo_path)
    full_path = _safe_path(repo_path, request.path)
    validation = validate_file(full_path, request.content)
    if not validation.is_valid:
        return validation

    if full_path.name in CRITICAL_FILES and not request.message:
        raise HTTPException(
            status_code=400,
            detail={"error": "confirmation_required", "message": "Critical files require confirmation."},
        )

    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(request.content, encoding="utf-8")

    audit_service.record_audit(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        username=username,
        action="write_file",
        resource=request.path,
        metadata={"environment": request.environment},
    )
    return validation


def create_file(
    db: Session,
    workspace_id: int,
    request: CreateFileRequest,
    *,
    user_id: int | None,
    username: str | None,
) -> ValidationResult:
    return write_file(db, workspace_id, request, user_id=user_id, username=username)


def delete_file(
    db: Session,
    workspace_id: int,
    request: DeleteFileRequest,
    *,
    user_id: int | None,
    username: str | None,
) -> None:
    record = _repo_record(db, workspace_id)
    workspace = _resolve_workspace(db, workspace_id)
    workspace_root = _workspace_root(get_settings(), workspace)
    repo_path = Path(record.directory).resolve()
    _assert_within_root(workspace_root, repo_path)
    full_path = _safe_path(repo_path, request.path)
    if full_path.name in CRITICAL_FILES:
        raise HTTPException(status_code=400, detail={"error": "protected_file", "message": "Cannot delete critical file."})
    if not full_path.exists():
        raise HTTPException(status_code=404, detail={"error": "file_not_found", "message": request.path})
    full_path.unlink()
    audit_service.record_audit(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        username=username,
        action="delete_file",
        resource=request.path,
        metadata={"environment": request.environment},
    )


def diff(db: Session, workspace_id: int, path: Optional[str] = None) -> List[GitDiff]:
    record = _repo_record(db, workspace_id)
    repo = _ensure_repo(record.directory)
    args = []
    if path:
        args.append(path)
    diff_text = repo.git.diff(*args)
    return [GitDiff(path=path or "working_tree", diff=diff_text)]


def history(db: Session, workspace_id: int, limit: int = 50) -> List[GitHistoryEntry]:
    record = _repo_record(db, workspace_id)
    repo = _ensure_repo(record.directory)
    entries: List[GitHistoryEntry] = []
    for commit in repo.iter_commits(max_count=limit):
        entries.append(
            GitHistoryEntry(
                commit_hash=commit.hexsha,
                author=str(commit.author),
                message=commit.message.strip(),
                timestamp=datetime.fromtimestamp(commit.committed_date, tz=timezone.utc),
            )
        )
    return entries


def audit(db: Session, workspace_id: int) -> List[AuditRecord]:
    records = audit_service.list_audit_records(db, workspace_id)
    return [
        AuditRecord(
            id=record.id,
            workspace_id=record.workspace_id,
            user_id=record.user_id,
            username=record.username,
            action=record.action,
            resource=record.resource,
            metadata=record.metadata_,
            created_at=record.created_at,
            commit_hash=record.commit_hash,
            environment=record.environment,
        )
        for record in records
    ]
