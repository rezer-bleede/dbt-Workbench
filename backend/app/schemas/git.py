from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class GitRepositorySummary(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    workspace_id: int
    remote_url: Optional[str]
    provider: Optional[str]
    default_branch: str
    directory: str
    last_synced_at: Optional[datetime]


class ConnectRepositoryRequest(BaseModel):
    workspace_id: int
    remote_url: Optional[str] = None
    provider: Optional[str] = None
    branch: str = Field(default="main")
    directory: Optional[str] = None
    auth_token: Optional[str] = None


class BranchSummary(BaseModel):
    name: str
    is_active: bool


class FileChange(BaseModel):
    path: str
    change_type: str
    staged: bool = False


class GitStatusResponse(BaseModel):
    branch: str
    is_clean: bool
    ahead: int = 0
    behind: int = 0
    changes: List[FileChange]
    has_conflicts: bool = False
    configured: bool = True


class GitHistoryEntry(BaseModel):
    commit_hash: str
    author: str
    message: str
    timestamp: datetime


class GitDiff(BaseModel):
    path: str
    diff: str


class FileNode(BaseModel):
    name: str
    path: str
    type: str
    children: Optional[List["FileNode"]] = None
    category: Optional[str] = None


class FileContent(BaseModel):
    path: str
    content: str
    readonly: bool = False


class WriteFileRequest(BaseModel):
    path: str
    content: str
    message: Optional[str] = None
    environment: Optional[str] = None


class CreateFileRequest(WriteFileRequest):
    category: Optional[str] = None


class DeleteFileRequest(BaseModel):
    path: str
    message: Optional[str] = None
    environment: Optional[str] = None


class CommitRequest(BaseModel):
    message: str
    files: Optional[List[str]] = None


class PushRequest(BaseModel):
    remote_name: str = "origin"
    branch: Optional[str] = None


class PullRequest(BaseModel):
    remote_name: str = "origin"
    branch: Optional[str] = None


class SwitchBranchRequest(BaseModel):
    branch: str


class ValidationResult(BaseModel):
    path: str
    is_valid: bool
    errors: List[str] = Field(default_factory=list)


class AuditRecord(BaseModel):
    id: int
    workspace_id: int
    user_id: Optional[int]
    username: Optional[str]
    action: str
    resource: str
    metadata: dict
    created_at: datetime
    commit_hash: Optional[str]
    environment: Optional[str]


class AuditQueryResponse(BaseModel):
    records: List[AuditRecord]
