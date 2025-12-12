"""Global artifact watcher manager for the application."""

from typing import Dict, Optional

from app.core.config import get_settings
from app.services.artifact_watcher import ArtifactWatcher

# Global watcher instances keyed by artifacts_path
_watchers: Dict[str, ArtifactWatcher] = {}


def get_watcher(artifacts_path: Optional[str] = None) -> ArtifactWatcher:
    """Get an artifact watcher instance for the given artifacts path.

    If no path is provided, the default dbt_artifacts_path from settings is used.
    """
    settings = get_settings()
    base_path = artifacts_path or settings.dbt_artifacts_path

    watcher = _watchers.get(base_path)
    if watcher is None:
        watcher = ArtifactWatcher(
            artifacts_path=base_path,
            max_versions=settings.max_artifact_versions,
            monitored_files=settings.monitored_artifact_files,
        )
        _watchers[base_path] = watcher
    return watcher


def start_watcher(artifacts_path: Optional[str] = None) -> None:
    """Start the artifact watcher for the given path (or default path)."""
    watcher = get_watcher(artifacts_path)
    watcher.start_watching()


def stop_watcher(artifacts_path: Optional[str] = None) -> None:
    """Stop the artifact watcher.

    If a path is provided, only that watcher is stopped. Otherwise all watchers
    are stopped and cleared.
    """
    global _watchers
    if artifacts_path is not None:
        watcher = _watchers.pop(artifacts_path, None)
        if watcher is not None:
            watcher.stop_watching()
        return

    for watcher in _watchers.values():
        watcher.stop_watching()
    _watchers = {}