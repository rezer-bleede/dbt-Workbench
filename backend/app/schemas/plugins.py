from __future__ import annotations

from typing import List, Optional

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

