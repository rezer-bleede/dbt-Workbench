from __future__ import annotations

import importlib
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Dict, List, Optional

from fastapi import APIRouter, FastAPI
from packaging.version import Version
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from app.core.config import get_settings

from .models import (
    PluginManifest,
    PluginRuntimeState,
    check_version_compatibility,
)

logger = logging.getLogger(__name__)


@dataclass
class PluginEvent:
    name: str
    payload: dict


class PluginEventBus:
    """Simple in-memory event bus for plugin lifecycle notifications."""

    def __init__(self) -> None:
        self._subscribers: Dict[str, List[str]] = {}
        self._lock = RLock()

    def subscribe(self, event: str, plugin_name: str) -> None:
        with self._lock:
            self._subscribers.setdefault(event, []).append(plugin_name)

    def emit(self, event: str, payload: Optional[dict] = None) -> PluginEvent:
        event_payload = payload or {}
        logger.info("Emitting plugin event %s to %d subscribers", event, len(self._subscribers.get(event, [])))
        return PluginEvent(name=event, payload=event_payload)


class PluginDirectoryWatcher(FileSystemEventHandler):
    """Watch a plugin directory and request reloads when changes occur."""

    def __init__(self, manager: "PluginManager") -> None:
        self.manager = manager

    def on_modified(self, event) -> None:  # pragma: no cover - filesystem integration
        self._handle(event)

    def on_created(self, event) -> None:  # pragma: no cover - filesystem integration
        self._handle(event)

    def _handle(self, event) -> None:
        if event.is_directory:
            return
        path = Path(event.src_path)
        manifest = path.parent / "manifest.json"
        if manifest.exists():
            self.manager.reload_plugin(path.parent.name)


class PluginManager:
    """Central registry for backend plugins and lifecycle management."""

    def __init__(self, app: Optional[FastAPI], plugins_dir: Optional[str] = None) -> None:
        self.app = app
        self.settings = get_settings()
        self.plugins_dir = Path(plugins_dir or self.settings.plugins_directory).resolve()
        self.event_bus = PluginEventBus()
        self._plugins: Dict[str, PluginRuntimeState] = {}
        self._lock = RLock()
        self._observer: Optional[Observer] = None

    # Discovery and validation -------------------------------------------------
    def discover(self) -> List[PluginRuntimeState]:
        results: List[PluginRuntimeState] = []
        if not self.plugins_dir.exists():
            logger.info("Plugins directory %s does not exist; skipping discovery", self.plugins_dir)
            return results

        for manifest_path in self.plugins_dir.glob("*/manifest.json"):
            try:
                runtime = self._load_manifest(manifest_path)
                results.append(runtime)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.error("Failed to load manifest %s: %s", manifest_path, exc)
        return results

    def _load_manifest(self, manifest_path: Path) -> PluginRuntimeState:
        manifest_data = json.loads(manifest_path.read_text())
        manifest = PluginManifest.model_validate(manifest_data)
        runtime = PluginRuntimeState(manifest=manifest, path=manifest_path.parent)
        runtime.compatibility_ok = self._check_compatibility(runtime)
        return runtime

    def _check_compatibility(self, runtime: PluginRuntimeState) -> bool:
        compatibility = runtime.manifest.compatibility
        workbench_ok = check_version_compatibility(compatibility.workbench_version, self.settings.backend_version)
        api_ok = check_version_compatibility(compatibility.plugin_api, self.settings.plugin_api_version)
        deps_ok = True
        for dep_name, spec in compatibility.depends_on.items():
            other = self._plugins.get(dep_name)
            if other is None:
                continue
            if not check_version_compatibility(spec, other.manifest.version):
                deps_ok = False
        return workbench_ok and api_ok and deps_ok

    # Loading and unloading ----------------------------------------------------
    def load_all(self) -> None:
        for runtime in self.discover():
            with self._lock:
                self._plugins[runtime.manifest.name] = runtime
            if runtime.compatibility_ok and self.settings.plugin_system_enabled:
                self.enable_plugin(runtime.manifest.name)

    def enable_plugin(self, name: str) -> PluginRuntimeState:
        with self._lock:
            runtime = self._plugins.get(name) or self._load_manifest(
                self.plugins_dir.joinpath(name, "manifest.json")
            )
            self._plugins[name] = runtime

        if not runtime.compatibility_ok:
            runtime.last_error = "compatibility check failed"
            return runtime

        if runtime.enabled:
            return runtime

        if runtime.manifest.backend.is_configured:
            try:
                router = self._load_backend(runtime)
                runtime.registered_routes = [route.path for route in router.routes]
                self.app.include_router(router)
            except Exception as exc:
                runtime.last_error = str(exc)
                logger.exception("Failed to enable backend for plugin %s", name)
                return runtime

        runtime.enabled = True
        runtime.last_error = None
        self.event_bus.emit("on-plugin-load", {"plugin": name})
        return runtime

    def disable_plugin(self, name: str) -> Optional[PluginRuntimeState]:
        with self._lock:
            runtime = self._plugins.get(name)
            if runtime is None:
                return None

        if runtime.registered_routes:
            self._remove_routes(runtime.registered_routes)
            runtime.registered_routes = []

        runtime.enabled = False
        self.event_bus.emit("on-plugin-unload", {"plugin": name})
        return runtime

    def reload_plugin(self, name: str) -> Optional[PluginRuntimeState]:
        logger.info("Hot reloading plugin %s", name)
        with self._lock:
            existing = self._plugins.get(name)
        if existing:
            self.disable_plugin(name)
        try:
            runtime = self._load_manifest(self.plugins_dir.joinpath(name, "manifest.json"))
        except FileNotFoundError:
            logger.warning("Plugin %s manifest missing during reload", name)
            return None
        with self._lock:
            self._plugins[name] = runtime
        runtime = self.enable_plugin(name)
        self.event_bus.emit("on-plugin-update", {"plugin": name})
        return runtime

    # Helper utilities ---------------------------------------------------------
    def _load_backend(self, runtime: PluginRuntimeState) -> APIRouter:
        if self.app is None:
            raise RuntimeError("FastAPI app not bound to PluginManager")
        entrypoint = runtime.manifest.backend
        backend_path = runtime.path.joinpath("backend")
        sys.path.insert(0, str(backend_path))
        module = importlib.import_module(entrypoint.module)  # type: ignore[arg-type]
        fn = getattr(module, entrypoint.callable)
        router = fn(self.app, runtime)  # type: ignore[misc]
        if not isinstance(router, APIRouter):
            raise ValueError("Backend entrypoint must return an APIRouter")
        return router

    def _remove_routes(self, paths: List[str]) -> None:
        routes = []
        for route in self.app.router.routes:
            route_path = getattr(route, "path", None)
            if route_path and route_path in paths:
                continue
            routes.append(route)
        self.app.router.routes = routes

    def list_plugins(self) -> List[PluginRuntimeState]:
        with self._lock:
            return list(self._plugins.values())

    def start_hot_reload(self) -> None:
        if not self.settings.plugin_hot_reload_enabled:
            return
        if self._observer is not None:
            return
        self.plugins_dir.mkdir(parents=True, exist_ok=True)
        handler = PluginDirectoryWatcher(self)
        observer = Observer()
        observer.schedule(handler, str(self.plugins_dir), recursive=True)
        observer.start()
        self._observer = observer
        logger.info("Plugin hot reload watcher started for %s", self.plugins_dir)

    def stop_hot_reload(self) -> None:
        if self._observer:
            self._observer.stop()
            self._observer.join()
            self._observer = None
            logger.info("Plugin hot reload watcher stopped")

    # Event shims --------------------------------------------------------------
    def emit_artifact_event(self, name: str, payload: dict) -> None:
        self.event_bus.emit(name, payload)

    def backend_version(self) -> Version:
        return Version(self.settings.backend_version)

