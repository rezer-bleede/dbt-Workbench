from __future__ import annotations

from typing import List


from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.auth import Role, WorkspaceContext, get_current_workspace, require_role
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.services.plugin_service import PluginService
from app.schemas.plugins import (
    PluginConfig,
    PluginConfigCreate,
    PluginConfigUpdate,
    PluginReloadResponse,
    PluginSummary,
    PluginToggleResponse,
)

router = APIRouter(prefix="/plugins", tags=["plugins"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_service(request: Request) -> PluginService:
    service: PluginService | None = getattr(request.app.state, "plugin_service", None)
    if service is None:
        service = PluginService(request.app)
        request.app.state.plugin_service = service
    return service


@router.get("/installed", response_model=list[PluginSummary])
def list_plugins(service: PluginService = Depends(get_service)):
    return [PluginSummary.model_validate(plugin) for plugin in service.list_plugins()]


@router.post(
    "/{plugin_name}/enable",
    response_model=PluginToggleResponse,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def enable_plugin(plugin_name: str, service: PluginService = Depends(get_service)):
    runtime = service.enable_plugin(plugin_name)
    if not runtime:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin not found")
    return PluginToggleResponse(
        plugin=PluginSummary.model_validate(runtime.as_summary()),
        action="enabled",
    )


@router.post(
    "/{plugin_name}/disable",
    response_model=PluginToggleResponse,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def disable_plugin(plugin_name: str, service: PluginService = Depends(get_service)):
    runtime = service.disable_plugin(plugin_name)
    if not runtime:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plugin not found")
    return PluginToggleResponse(
        plugin=PluginSummary.model_validate(runtime.as_summary()),
        action="disabled",
    )


@router.post(
    "/reload",
    response_model=PluginReloadResponse,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def reload_plugins(
    plugin_name: str | None = None,
    service: PluginService = Depends(get_service),
):
    refreshed = service.reload(plugin_name)
    return PluginReloadResponse(
        reloaded=[PluginSummary.model_validate(p.as_summary()) for p in refreshed if p]
    )


# --- Workspace-scoped plugin configuration endpoints ---


@router.get("/config", response_model=List[PluginConfig])
def list_plugin_configs(
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> List[PluginConfig]:
    """List all plugin configurations for the current workspace."""
    configs = (
        db.query(db_models.PluginWorkspaceConfig)
        .filter(db_models.PluginWorkspaceConfig.workspace_id == workspace.id)
        .order_by(db_models.PluginWorkspaceConfig.plugin_name)
        .all()
    )
    return [PluginConfig.model_validate(c) for c in configs]


@router.get("/config/{plugin_name}", response_model=PluginConfig)
def get_plugin_config(
    plugin_name: str,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> PluginConfig:
    """Get configuration for a specific plugin in the current workspace."""
    config = (
        db.query(db_models.PluginWorkspaceConfig)
        .filter(
            db_models.PluginWorkspaceConfig.workspace_id == workspace.id,
            db_models.PluginWorkspaceConfig.plugin_name == plugin_name,
        )
        .first()
    )
    if not config:
        raise HTTPException(status_code=404, detail="Plugin configuration not found")
    return PluginConfig.model_validate(config)


@router.post(
    "/config",
    response_model=PluginConfig,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def create_plugin_config(
    config_in: PluginConfigCreate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> PluginConfig:
    """Create or update plugin configuration for the current workspace."""
    # Check if config already exists
    existing = (
        db.query(db_models.PluginWorkspaceConfig)
        .filter(
            db_models.PluginWorkspaceConfig.workspace_id == workspace.id,
            db_models.PluginWorkspaceConfig.plugin_name == config_in.plugin_name,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Configuration for plugin '{config_in.plugin_name}' already exists",
        )

    db_config = db_models.PluginWorkspaceConfig(
        plugin_name=config_in.plugin_name,
        enabled=config_in.enabled,
        settings=config_in.settings,
        workspace_id=workspace.id,
    )
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return PluginConfig.model_validate(db_config)


@router.put(
    "/config/{plugin_name}",
    response_model=PluginConfig,
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def update_plugin_config(
    plugin_name: str,
    config_in: PluginConfigUpdate,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> PluginConfig:
    """Update plugin configuration for the current workspace."""
    db_config = (
        db.query(db_models.PluginWorkspaceConfig)
        .filter(
            db_models.PluginWorkspaceConfig.workspace_id == workspace.id,
            db_models.PluginWorkspaceConfig.plugin_name == plugin_name,
        )
        .first()
    )
    if not db_config:
        raise HTTPException(status_code=404, detail="Plugin configuration not found")

    if config_in.enabled is not None:
        db_config.enabled = config_in.enabled
    if config_in.settings is not None:
        db_config.settings = config_in.settings

    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return PluginConfig.model_validate(db_config)


@router.delete(
    "/config/{plugin_name}",
    dependencies=[Depends(require_role(Role.ADMIN))],
)
def delete_plugin_config(
    plugin_name: str,
    db: Session = Depends(get_db),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> dict:
    """Delete plugin configuration for the current workspace."""
    db_config = (
        db.query(db_models.PluginWorkspaceConfig)
        .filter(
            db_models.PluginWorkspaceConfig.workspace_id == workspace.id,
            db_models.PluginWorkspaceConfig.plugin_name == plugin_name,
        )
        .first()
    )
    if not db_config:
        raise HTTPException(status_code=404, detail="Plugin configuration not found")

    db.delete(db_config)
    db.commit()
    return {"message": f"Configuration for plugin '{plugin_name}' deleted"}
