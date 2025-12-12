import json
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.database.connection import Base
from app.services.artifact_service import ArtifactService
from app.services.catalog_service import CatalogService
from app.schemas import catalog as catalog_schemas


def write_json(base: Path, name: str, payload: dict):
    (base / name).write_text(json.dumps(payload))


def build_artifacts(tmp_path: Path):
    manifest = {
        "nodes": {
            "model.demo.orders": {
                "resource_type": "model",
                "name": "orders",
                "database": "db",
                "schema": "analytics",
                "tags": ["core"],
                "description": "Orders model",
                "columns": {
                    "id": {"name": "id", "description": "order id", "tags": ["pk"]},
                    "amount": {"name": "amount", "description": "amount"},
                },
                "meta": {"owner": "data-eng"},
                "depends_on": {"nodes": []},
            },
            "test.demo.orders.not_null_id": {
                "resource_type": "test",
                "name": "not_null_orders_id",
                "column_name": "id",
                "severity": "error",
                "depends_on": {"nodes": ["model.demo.orders"]},
            },
        },
        "macros": {
            "macro.demo.helper": {
                "resource_type": "macro",
                "name": "helper_macro",
                "description": "macro helper",
            }
        },
        "sources": {
            "source.demo.raw_orders": {
                "resource_type": "source",
                "name": "raw_orders",
                "database": "db",
                "schema": "raw",
                "description": "Raw orders",
                "freshness": {"max_loaded_at": "2024-06-11T00:00:00", "threshold": 1440},
                "columns": {"id": {"name": "id", "description": "id"}},
                "meta": {"owner": "analytics"},
            }
        },
        "exposures": {
            "exposure.demo.dashboard": {
                "resource_type": "exposure",
                "name": "dashboard",
                "description": "BI dashboard",
            }
        },
    }
    catalog = {
        "nodes": {
            "model.demo.orders": {
                "metadata": {},
                "columns": {
                    "id": {
                        "name": "id",
                        "type": "integer",
                        "comment": "order id",
                        "nullable": False,
                        "stats": {"nulls": {"value": 0}, "distinct": {"value": 10}},
                    },
                    "amount": {
                        "name": "amount",
                        "type": "numeric",
                        "comment": "amount",
                        "nullable": True,
                        "stats": {"nulls": {"value": 1}, "min": {"value": 1}, "max": {"value": 10}},
                    },
                },
            }
        },
        "sources": {
            "source.demo.raw_orders": {
                "freshness": {"max_loaded_at": "2024-06-11T00:00:00", "threshold": 1440, "status": "on-time"},
                "columns": {"id": {"name": "id", "type": "integer", "comment": "source id"}},
            }
        },
    }
    run_results = {
        "results": [
            {
                "unique_id": "test.demo.orders.not_null_id",
                "status": "fail",
                "timing": [],
            }
        ]
    }
    write_json(tmp_path, "manifest.json", manifest)
    write_json(tmp_path, "catalog.json", catalog)
    write_json(tmp_path, "run_results.json", run_results)



def build_service(tmp_path: Path) -> CatalogService:
    settings = Settings(dbt_artifacts_path=str(tmp_path), database_url_override="sqlite://")
    artifact_service = ArtifactService(settings.dbt_artifacts_path)
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return CatalogService(artifact_service, settings, session_factory=TestingSessionLocal)


def test_catalog_service_search_and_detail(tmp_path: Path):
    build_artifacts(tmp_path)
    service = build_service(tmp_path)

    summaries = service.list_entities()
    assert any(s.resource_type == "model" for s in summaries)

    detail = service.entity_detail("model.demo.orders")
    assert detail is not None
    assert detail.test_status == "fail"
    assert any(col.statistics for col in detail.columns)

    search = service.search("ord")
    assert "model" in search.results
    assert search.results["model"][0].name == "orders"

    updated = service.update_metadata(
        "model.demo.orders",
        catalog_schemas.MetadataUpdate(owner="owner@example.com", description="User desc", tags=["gold"]),
    )
    assert updated.user_description == "User desc"
    assert "gold" in updated.user_tags

    updated_columns = service.update_column_metadata(
        "model.demo.orders",
        "amount",
        catalog_schemas.ColumnMetadataUpdate(description="User column desc", tags=["finance"], owner="finance"),
    )
    assert any(col.user_description == "User column desc" for col in updated_columns)

    validation = service.validate()
    assert validation.issues  # some validation issues expected for coverage


def test_catalog_api_endpoints(tmp_path: Path):
    build_artifacts(tmp_path)
    service = build_service(tmp_path)

    app = FastAPI()
    from app.api.routes import catalog as catalog_route

    app.dependency_overrides[catalog_route.get_service] = lambda: service
    app.include_router(catalog_route.router)

    client = TestClient(app)
    entities = client.get("/catalog/entities").json()
    assert any(e["resource_type"] == "model" for e in entities)

    detail = client.get("/catalog/entities/model.demo.orders")
    assert detail.status_code == 200
    assert detail.json()["name"] == "orders"

    patched = client.patch(
        "/catalog/entities/model.demo.orders",
        json={"owner": "api-user", "description": "Updated via API", "tags": ["tagged"]},
    )
    assert patched.status_code == 200
    assert patched.json()["user_description"] == "Updated via API"

    validation = client.get("/catalog/validation")
    assert validation.status_code == 200
    assert "issues" in validation.json()

