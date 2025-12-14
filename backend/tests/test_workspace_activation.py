from fastapi.testclient import TestClient

from app.database.connection import Base, SessionLocal, engine
from app.database.models import models as db_models
from app.main import app


def setup_function(_function):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _workspace(key: str, artifacts_path: str) -> db_models.Workspace:
    db = SessionLocal()
    workspace = db_models.Workspace(
        key=key,
        name=f"Workspace {key}",
        description=None,
        artifacts_path=artifacts_path,
        is_active=True,
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    db.close()
    return workspace


def test_active_workspace_can_be_switched_without_auth_headers():
    ws1 = _workspace("one", "/tmp/one")
    ws2 = _workspace("two", "/tmp/two")

    client = TestClient(app)

    res = client.get("/workspaces")
    assert res.status_code == 200
    ids = {w["id"] for w in res.json()}
    assert {ws1.id, ws2.id}.issubset(ids)

    res_active = client.get("/workspaces/active", headers={"X-Workspace-Id": str(ws2.id)})
    assert res_active.status_code == 200
    body = res_active.json()
    assert body["id"] == ws2.id
    assert body["name"] == ws2.name


def test_missing_workspace_header_errors():
    ws1 = _workspace("one", "/tmp/one")
    _workspace("two", "/tmp/two")

    client = TestClient(app)
    res = client.get("/workspaces/active", headers={"X-Workspace-Id": str(ws1.id + 10)})
    assert res.status_code == 404
    assert res.json()["detail"]["error"] == "workspace_not_found"
