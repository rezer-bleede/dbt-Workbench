from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

from packaging.specifiers import SpecifierSet
from packaging.version import Version
from pydantic import BaseModel, Field, model_validator


class PluginCapability(str, Enum):
    READ_METADATA = "read-metadata"
    WRITE_METADATA = "write-metadata"
    EXTEND_API = "extend-api"
    MODIFY_LINEAGE = "modify-lineage"
    ACCESS_SQL_WORKSPACE = "access-sql-workspace"
    REGISTER_SCHEDULE_HOOKS = "register-schedule-hooks"
    ACCESS_ENVIRONMENT_CONFIG = "access-environment-config"


class PluginPermission(str, Enum):
    SAFE_READ = "safe-read"
    EXTENDED_ACCESS = "extended-access"
    SCHEDULER = "scheduler"
    SEARCH_INDEX = "search-index"


class PluginEntrypoint(BaseModel):
    module: Optional[str] = Field(
        default=None, description="Python module path that exposes the entrypoint callable"
    )
    callable: Optional[str] = Field(
        default=None, description="Callable name to invoke for registration"
    )

    @property
    def is_configured(self) -> bool:
        return bool(self.module and self.callable)


class PluginCompatibility(BaseModel):
    workbench_version: Optional[str] = Field(
        default=None, description="Supported dbt-Workbench version specifier"
    )
    plugin_api: Optional[str] = Field(
        default=None, description="Supported plugin API version specifier"
    )
    depends_on: Dict[str, str] = Field(
        default_factory=dict,
        description="Plugin dependencies keyed by plugin name with version specifiers",
    )


class PluginManifest(BaseModel):
    name: str
    version: str
    description: str
    author: str
    capabilities: List[PluginCapability]
    permissions: List[PluginPermission] = Field(default_factory=list)
    backend: PluginEntrypoint = Field(default_factory=PluginEntrypoint)
    frontend: PluginEntrypoint = Field(default_factory=PluginEntrypoint)
    entrypoints: List[str] = Field(default_factory=list)
    compatibility: PluginCompatibility = Field(default_factory=PluginCompatibility)
    screenshots: List[str] = Field(default_factory=list)
    homepage: Optional[str] = None

    @model_validator(mode="after")
    def validate_versions(self) -> "PluginManifest":
        # Ensure version parsable
        Version(self.version)
        return self


class PluginRuntimeState(BaseModel):
    manifest: PluginManifest
    path: Path
    enabled: bool = False
    last_error: Optional[str] = None
    compatibility_ok: bool = True
    registered_routes: List[str] = Field(default_factory=list)

    class Config:
        arbitrary_types_allowed = True

    def as_summary(self) -> Dict[str, object]:
        return {
            "name": self.manifest.name,
            "version": self.manifest.version,
            "description": self.manifest.description,
            "author": self.manifest.author,
            "capabilities": [c.value for c in self.manifest.capabilities],
            "permissions": [p.value for p in self.manifest.permissions],
            "enabled": self.enabled,
            "last_error": self.last_error,
            "compatibility_ok": self.compatibility_ok,
            "screenshots": self.manifest.screenshots,
            "homepage": self.manifest.homepage,
        }


def check_version_compatibility(spec: Optional[str], current: str) -> bool:
    """Validate a version string against a specifier.

    An empty specifier is treated as compatible.
    """

    if not spec:
        return True
    try:
        spec_set = SpecifierSet(spec)
    except Exception:
        return False
    try:
        return Version(current) in spec_set
    except Exception:
        return False
