from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.core.plugins.models import PluginCapability, PluginPermission


class PluginSummary(BaseModel):
    name: str
    version: str
    description: str
    author: str
    capabilities: List[PluginCapability]
    permissions: List[PluginPermission] = Field(default_factory=list)
    enabled: bool
    last_error: Optional[str] = None
    compatibility_ok: bool = True
    screenshots: List[str] = Field(default_factory=list)
    homepage: Optional[str] = None


class PluginToggleResponse(BaseModel):
    plugin: PluginSummary
    action: str


class PluginReloadResponse(BaseModel):
    reloaded: List[PluginSummary]


class PluginConfig(BaseModel):
    """Workspace-scoped plugin configuration."""
    id: int
    plugin_name: str
    enabled: bool
    settings: Dict[str, Any] = Field(default_factory=dict)
    workspace_id: int

    model_config = {"from_attributes": True}


class PluginConfigCreate(BaseModel):
    """Create workspace-scoped plugin configuration."""
    plugin_name: str
    enabled: bool = True
    settings: Dict[str, Any] = Field(default_factory=dict)


class PluginConfigUpdate(BaseModel):
    """Update workspace-scoped plugin configuration."""
    enabled: Optional[bool] = None
    settings: Optional[Dict[str, Any]] = None
