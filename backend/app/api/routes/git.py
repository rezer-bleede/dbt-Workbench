from typing import List, Optional

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.auth import Role, UserContext, WorkspaceContext, get_current_user, get_current_workspace, require_role
from app.database.connection import SessionLocal
from app.schemas.git import (
    AuditQueryResponse,
    BranchSummary,
    CommitRequest,
    ConnectRepositoryRequest,
    CreateFileRequest,
    DeleteFileRequest,
    FileContent,
    FileNode,
    GitDiff,
    GitHistoryEntry,
    GitRepositorySummary,
    GitStatusResponse,
    PullRequest,
    PushRequest,
    ValidationResult,
    WriteFileRequest,
)
from app.services import git_service

router = APIRouter(prefix="/git", tags=["git"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post(
    "/connect",
    response_model=GitRepositorySummary,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def connect_repository(
    request: ConnectRepositoryRequest,
    response: Response,
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GitRepositorySummary:
    response.headers["Cache-Control"] = "no-store"
    return git_service.connect_repository(
        db,
        workspace_id=request.workspace_id,
        remote_url=request.remote_url,
        branch=request.branch,
        directory=request.directory,
        provider=request.provider,
        user_id=current_user.id,
        username=current_user.username,
    )


@router.get("/status", response_model=GitStatusResponse)
def get_status(
    workspace: WorkspaceContext = Depends(get_current_workspace),
    db: Session = Depends(get_db),
) -> GitStatusResponse:
    return git_service.get_status(db, workspace.id)


@router.get("/branches", response_model=List[BranchSummary])
def list_branches(
    workspace: WorkspaceContext = Depends(get_current_workspace),
    db: Session = Depends(get_db),
) -> List[BranchSummary]:
    return git_service.list_branches(db, workspace.id)


@router.post(
    "/pull",
    response_model=GitStatusResponse,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def pull(
    request: PullRequest,
    workspace: WorkspaceContext = Depends(get_current_workspace),
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GitStatusResponse:
    return git_service.pull(
        db,
        workspace_id=workspace.id,
        request=request,
        user_id=current_user.id,
        username=current_user.username,
    )


@router.post(
    "/push",
    response_model=GitStatusResponse,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def push(
    request: PushRequest,
    workspace: WorkspaceContext = Depends(get_current_workspace),
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GitStatusResponse:
    return git_service.push(
        db,
        workspace_id=workspace.id,
        request=request,
        user_id=current_user.id,
        username=current_user.username,
    )


@router.post(
    "/commit",
    response_model=str,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def commit_changes(
    request: CommitRequest,
    workspace: WorkspaceContext = Depends(get_current_workspace),
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    return git_service.commit_changes(
        db,
        workspace_id=workspace.id,
        message=request.message,
        files=request.files,
        user_id=current_user.id,
        username=current_user.username,
    )


@router.post(
    "/switch",
    response_model=GitStatusResponse,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def switch_branch(
    branch: str,
    workspace: WorkspaceContext = Depends(get_current_workspace),
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GitStatusResponse:
    return git_service.switch_branch(
        db,
        workspace_id=workspace.id,
        branch=branch,
        user_id=current_user.id,
        username=current_user.username,
    )


@router.get("/files", response_model=List[FileNode])
def list_files(
    workspace: WorkspaceContext = Depends(get_current_workspace),
    db: Session = Depends(get_db),
) -> List[FileNode]:
    return git_service.list_files(db, workspace.id)


@router.get("/file", response_model=FileContent)
def read_file(
    path: str,
    workspace: WorkspaceContext = Depends(get_current_workspace),
    db: Session = Depends(get_db),
) -> FileContent:
    return git_service.read_file(db, workspace.id, path)


@router.put(
    "/file",
    response_model=ValidationResult,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def write_file(
    request: WriteFileRequest,
    workspace: WorkspaceContext = Depends(get_current_workspace),
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ValidationResult:
    return git_service.write_file(
        db,
        workspace_id=workspace.id,
        request=request,
        user_id=current_user.id,
        username=current_user.username,
    )


@router.post(
    "/file",
    response_model=ValidationResult,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def create_file(
    request: CreateFileRequest,
    workspace: WorkspaceContext = Depends(get_current_workspace),
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ValidationResult:
    return git_service.create_file(
        db,
        workspace_id=workspace.id,
        request=request,
        user_id=current_user.id,
        username=current_user.username,
    )


@router.delete(
    "/file",
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def delete_file(
    request: DeleteFileRequest,
    workspace: WorkspaceContext = Depends(get_current_workspace),
    current_user: UserContext = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    return git_service.delete_file(
        db,
        workspace_id=workspace.id,
        request=request,
        user_id=current_user.id,
        username=current_user.username,
    )


@router.get("/diff", response_model=List[GitDiff])
def diff(
    path: Optional[str] = None,
    workspace: WorkspaceContext = Depends(get_current_workspace),
    db: Session = Depends(get_db),
) -> List[GitDiff]:
    return git_service.diff(db, workspace.id, path)


@router.get("/history", response_model=List[GitHistoryEntry])
def history(
    workspace: WorkspaceContext = Depends(get_current_workspace),
    limit: int = 50,
    db: Session = Depends(get_db),
) -> List[GitHistoryEntry]:
    return git_service.history(db, workspace.id, limit)


@router.get("/audit", response_model=AuditQueryResponse)
def audit(
    workspace: WorkspaceContext = Depends(get_current_workspace),
    db: Session = Depends(get_db),
) -> AuditQueryResponse:
    records = git_service.audit(db, workspace.id)
    return AuditQueryResponse(records=records)
