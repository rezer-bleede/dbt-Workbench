from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.core.auth import Role


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class WorkspaceSummary(BaseModel):
    id: int
    key: str
    name: str
    description: Optional[str] = None
    artifacts_path: str


class UserSummary(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: Role
    is_active: bool
    workspaces: List[WorkspaceSummary] = Field(default_factory=list)
    default_workspace_id: Optional[int] = None


class LoginResponse(BaseModel):
    tokens: TokenResponse
    user: UserSummary
    active_workspace: Optional[WorkspaceSummary] = None


class WorkspaceCreate(BaseModel):
    key: str
    name: str
    description: Optional[str] = None
    artifacts_path: str


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    artifacts_path: Optional[str] = None
    is_active: Optional[bool] = None


class UserCreate(BaseModel):
    username: str
    password: str
    role: Role
    full_name: Optional[str] = None
    workspace_ids: List[int] = Field(default_factory=list)
    default_workspace_id: Optional[int] = None


class UserUpdate(BaseModel):
    role: Optional[Role] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    workspace_ids: Optional[List[int]] = None
    default_workspace_id: Optional[int] = None


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: Role = Role.VIEWER
    workspace_ids: List[int] = Field(min_length=1)


class ApiKeySummary(BaseModel):
    id: int
    name: str
    key_prefix: str
    role: Role
    workspace_ids: List[int]
    created_at: datetime
    last_used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None


class ApiKeyCreated(ApiKeySummary):
    key: str
