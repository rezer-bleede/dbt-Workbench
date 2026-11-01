from collections.abc import Generator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes import auth as auth_routes
from app.api.routes import workspaces as workspaces_routes
from app.core import auth as core_auth
from app.core.config import Settings, get_settings
from app.core.auth import Role, UserContext
from app.database.connection import Base
from app.database.models import models as db_models


def test_api_key_create_scope_and_revoke() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)

    def db_override() -> Generator:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    db = session_factory()
    workspace = db_models.Workspace(key="one", name="One", artifacts_path="/one", is_active=True)
    other_workspace = db_models.Workspace(key="two", name="Two", artifacts_path="/two", is_active=True)
    db.add_all([workspace, other_workspace])
    db.commit()
    workspace_id = workspace.id
    other_workspace_id = other_workspace.id
    db.close()

    settings = Settings(auth_enabled=True, single_project_mode=False)
    admin = UserContext(
        id=1,
        username="admin",
        role=Role.ADMIN,
        workspace_ids=[workspace_id, other_workspace_id],
        active_workspace_id=workspace_id,
        auth_enabled=True,
    )
    app = FastAPI()
    app.include_router(auth_routes.router)
    app.include_router(workspaces_routes.router)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[core_auth.get_db] = db_override
    app.dependency_overrides[auth_routes.get_db] = db_override
    app.dependency_overrides[workspaces_routes.get_db] = db_override
    app.dependency_overrides[core_auth.get_current_user] = lambda: admin

    with TestClient(app) as client:
        created = client.post(
            "/auth/api-keys",
            json={"name": "agent", "role": "developer", "workspace_ids": [workspace_id]},
        )
        assert created.status_code == 200
        key = created.json()["key"]
        key_id = created.json()["id"]
        assert key.startswith("dbw_")

        listed = client.get("/auth/api-keys")
        assert listed.status_code == 200
        assert "key" not in listed.json()[0]

        app.dependency_overrides.pop(core_auth.get_current_user)
        headers = {"Authorization": f"Bearer {key}"}
        active = client.get("/workspaces/active", headers=headers)
        assert active.status_code == 200
        assert active.json()["id"] == workspace_id
        scoped = client.get("/workspaces", headers=headers)
        assert [row["id"] for row in scoped.json()] == [workspace_id]
        forbidden = client.get(
            "/workspaces/active",
            headers={**headers, "X-Workspace-Id": str(other_workspace_id)},
        )
        assert forbidden.status_code == 403

        app.dependency_overrides[core_auth.get_current_user] = lambda: admin
        revoked = client.delete(f"/auth/api-keys/{key_id}")
        assert revoked.status_code == 200
        app.dependency_overrides.pop(core_auth.get_current_user)

        rejected = client.get("/workspaces/active", headers=headers)
        assert rejected.status_code == 401

    Base.metadata.drop_all(engine)
    engine.dispose()
