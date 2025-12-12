import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.plugins.manager import PluginManager
from app.core.plugins.models import PluginCapability, PluginManifest, PluginPermission
from app.services.plugin_service import PluginService


def _build_sample_plugin(tmp_path: Path, name: str = "sample") -> Path:
    plugin_dir = tmp_path / name
    backend_dir = plugin_dir / "backend"
    backend_dir.mkdir(parents=True)

    manifest = {
        "name": name,
        "version": "1.0.0",
        "description": "Sample plugin",
        "author": "Test",
        "capabilities": [PluginCapability.EXTEND_API.value],
        "permissions": [PluginPermission.SAFE_READ.value],
        "backend": {"module": "sample_backend", "callable": "build_router"},
        "frontend": {},
        "compatibility": {"plugin_api": ">=1.0.0"},
    }
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest))
    backend_module = backend_dir / "sample_backend.py"
    backend_module.write_text(
        "from fastapi import APIRouter\n"
        "def build_router(app, runtime):\n"
        "    router = APIRouter(prefix='/plugins/test')\n"
        "    @router.get('/ping')\n"
        "    def ping():\n"
        "        return {'status': 'ok', 'plugin': runtime.manifest.name}\n"
        "    return router\n"
    )
    return plugin_dir


def test_manifest_validation_handles_capabilities(tmp_path: Path):
    manifest_path = _build_sample_plugin(tmp_path) / "manifest.json"
    manifest = PluginManifest.model_validate(json.loads(manifest_path.read_text()))
    assert manifest.capabilities == [PluginCapability.EXTEND_API]
    assert manifest.permissions == [PluginPermission.SAFE_READ]


def test_enable_and_disable_plugin_routes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    app = FastAPI()
    plugin_dir = _build_sample_plugin(tmp_path)
    manager = PluginManager(app, plugins_dir=str(tmp_path))
    service = PluginService(app, manager)
    app.state.plugin_service = service
    service.initialize()

    client = TestClient(app)
    response = client.get("/plugins/test/ping")
    assert response.status_code == 200
    assert response.json()["plugin"] == "sample"

    service.disable_plugin("sample")
    service.manager.stop_hot_reload()
    response = client.get("/plugins/test/ping")
    assert response.status_code == 404


def test_plugin_api_endpoints(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    app = FastAPI()
    plugin_dir = _build_sample_plugin(tmp_path)
    manager = PluginManager(app, plugins_dir=str(tmp_path))
    service = PluginService(app, manager)
    service.initialize()
    app.state.plugin_service = service

    from app.api.routes.plugins import router as plugin_router

    app.include_router(plugin_router)
    client = TestClient(app)

    resp = client.get("/plugins/installed")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == plugin_dir.name

    disable_resp = client.post(f"/plugins/{plugin_dir.name}/disable")
    assert disable_resp.status_code == 200
    assert disable_resp.json()["plugin"]["enabled"] is False

    enable_resp = client.post(f"/plugins/{plugin_dir.name}/enable")
    assert enable_resp.status_code == 200
    assert enable_resp.json()["plugin"]["enabled"] is True
    service.manager.stop_hot_reload()
