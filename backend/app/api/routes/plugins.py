from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.auth import Role, require_role
from app.services.plugin_service import PluginService
from app.schemas.plugins import PluginReloadResponse, PluginSummary, PluginToggleResponse

router = APIRouter(prefix="/plugins", tags=["plugins"])


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

