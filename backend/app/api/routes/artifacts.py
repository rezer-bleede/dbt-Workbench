from fastapi import APIRouter, Depends
from typing import Dict, Any, Optional

from app.core.config import get_settings, Settings
from app.core.watcher_manager import get_watcher
from app.schemas.responses import ArtifactSummary
from app.services.artifact_service import ArtifactService
from app.services.artifact_watcher import ArtifactWatcher

router = APIRouter()


def get_service(settings: Settings = Depends(get_settings)) -> ArtifactService:
    return ArtifactService(settings.dbt_artifacts_path)


def get_artifact_watcher() -> ArtifactWatcher:
    return get_watcher()


@router.get("/artifacts", response_model=ArtifactSummary)
def artifact_summary(service: ArtifactService = Depends(get_service)) -> ArtifactSummary:
    summary = service.get_artifact_summary()
    return ArtifactSummary(**summary)


@router.get("/artifacts/versions")
def get_artifact_versions(watcher: ArtifactWatcher = Depends(get_artifact_watcher)) -> Dict[str, Any]:
    """Get version information for all monitored artifacts."""
    return watcher.get_version_info()


@router.get("/artifacts/versions/check")
def check_version_updates(
    manifest_version: Optional[int] = None,
    catalog_version: Optional[int] = None,
    run_results_version: Optional[int] = None,
    watcher: ArtifactWatcher = Depends(get_artifact_watcher)
) -> Dict[str, Any]:
    """Check if any artifacts have been updated since the provided versions."""
    version_info = watcher.get_version_info()
    
    client_versions = {
        "manifest.json": manifest_version or 0,
        "catalog.json": catalog_version or 0,
        "run_results.json": run_results_version or 0
    }
    
    updates_available = {}
    for filename, client_version in client_versions.items():
        current_version = version_info[filename]["current_version"]
        updates_available[filename] = current_version > client_version
    
    return {
        "updates_available": updates_available,
        "any_updates": any(updates_available.values()),
        "current_versions": {
            filename: info["current_version"] 
            for filename, info in version_info.items()
        },
        "version_info": version_info
    }
