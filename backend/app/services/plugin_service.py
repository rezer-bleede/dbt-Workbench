from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI

from app.core.plugins.manager import PluginManager
from app.core.plugins.models import PluginManifest, PluginRuntimeState


class PluginService:
    """Facade around the PluginManager used by API routes and other services."""

    def __init__(self, app: Optional[FastAPI], manager: Optional[PluginManager] = None):
        self.app = app
        self.manager = manager or PluginManager(app)  # type: ignore[arg-type]

    def initialize(self) -> None:
        if not self.manager.settings.plugin_system_enabled:
            return
        self.manager.load_all()
        self.manager.start_hot_reload()

    def list_plugins(self) -> List[Dict[str, object]]:
        return [plugin.as_summary() for plugin in self.manager.list_plugins()]

    def get_plugin(self, name: str) -> Optional[PluginRuntimeState]:
        return next((p for p in self.manager.list_plugins() if p.manifest.name == name), None)

    def enable_plugin(self, name: str) -> Optional[PluginRuntimeState]:
        return self.manager.enable_plugin(name)

    def disable_plugin(self, name: str) -> Optional[PluginRuntimeState]:
        return self.manager.disable_plugin(name)

    def reload(self, name: Optional[str] = None) -> List[PluginRuntimeState]:
        if name:
            plugin = self.manager.reload_plugin(name)
            return [plugin] if plugin else []
        refreshed: List[PluginRuntimeState] = []
        for runtime in self.manager.list_plugins():
            refreshed_plugin = self.manager.reload_plugin(runtime.manifest.name)
            if refreshed_plugin:
                refreshed.append(refreshed_plugin)
        return refreshed

    def load_manifest_from_path(self, path: Path) -> PluginManifest:
        return self.manager._load_manifest(path)  # type: ignore[attr-defined]

