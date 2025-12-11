"""Global artifact watcher manager for the application."""

from typing import Optional
from app.services.artifact_watcher import ArtifactWatcher
from app.core.config import get_settings

# Global watcher instance
_watcher: Optional[ArtifactWatcher] = None


def get_watcher() -> ArtifactWatcher:
    """Get the global artifact watcher instance."""
    global _watcher
    if _watcher is None:
        settings = get_settings()
        _watcher = ArtifactWatcher(
            artifacts_path=settings.dbt_artifacts_path,
            max_versions=settings.max_artifact_versions,
            monitored_files=settings.monitored_artifact_files
        )
    return _watcher


def start_watcher():
    """Start the global artifact watcher."""
    watcher = get_watcher()
    watcher.start_watching()


def stop_watcher():
    """Stop the global artifact watcher."""
    global _watcher
    if _watcher is not None:
        _watcher.stop_watching()
        _watcher = None