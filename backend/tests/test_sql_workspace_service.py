import hashlib
import json
import os
from pathlib import Path

from app.core.config import Settings
from app.database.connection import Base, engine, SessionLocal
from app.database.models import models as db_models
from app.schemas.sql_workspace import DbtModelExecuteRequest
from app.services.sql_workspace_service import SqlWorkspaceService


def write_artifact(base: Path, name: str, payload: dict) -> None:
    (base / name).write_text(json.dumps(payload))


def create_service(tmp_path: Path) -> SqlWorkspaceService:
    settings = Settings(dbt_artifacts_path=str(tmp_path))
    return SqlWorkspaceService(str(tmp_path), workspace_id=None, settings=settings)


def reset_database() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_autocomplete_metadata_includes_models_and_sources(tmp_path: Path) -> None:
    reset_database()
    manifest = {
        "nodes": {
            "model.test.one": {
                "resource_type": "model",
                "name": "one",
                "alias": "one",
                "database": "db",
                "schema": "analytics",
                "original_file_path": "models/one.sql",
                "columns": {"id": {"name": "id", "data_type": "integer"}},
                "tags": ["core"],
            }
        },
        "sources": {
            "source.test.raw": {
                "resource_type": "source",
                "name": "raw",
                "source_name": "test",
                "database": "db",
                "schema": "raw",
                "identifier": "raw_table",
                "columns": {"id": {"name": "id", "data_type": "integer"}},
            }
        },
    }
    catalog = {
        "nodes": {
            "model.test.one": {
                "columns": {
                    "id": {"name": "id", "type": "integer", "nullable": False},
                }
            }
        },
        "sources": {
            "source.test.raw": {
                "columns": {
                    "id": {"name": "id", "type": "integer", "nullable": True},
                }
            }
        },
    }
    write_artifact(tmp_path, "manifest.json", manifest)
    write_artifact(tmp_path, "catalog.json", catalog)

    service = create_service(tmp_path)
    metadata = service.get_autocomplete_metadata()

    assert any(m.unique_id == "model.test.one" for m in metadata.models)
    assert any(m.original_file_path == "models/one.sql" for m in metadata.models)
    assert any(s.unique_id == "source.test.raw" for s in metadata.sources)

    schema_keys = list(metadata.schemas.keys())
    assert any("analytics" in key for key in schema_keys)
    assert any("raw" in key for key in schema_keys)


def test_compiled_sql_returns_checksum_and_source(tmp_path: Path) -> None:
    reset_database()
    manifest = {
        "metadata": {"target": {"name": "dev"}},
        "nodes": {
            "model.test.one": {
                "resource_type": "model",
                "name": "one",
                "alias": "one",
                "database": "db",
                "schema": "analytics",
                "compiled_code": "select 1 as col",
                "raw_code": "select {{ 1 }} as col",
                "original_file_path": "models/one.sql",
            }
        },
    }
    write_artifact(tmp_path, "manifest.json", manifest)

    service = create_service(tmp_path)
    compiled = service.get_compiled_sql("model.test.one")

    assert compiled.compiled_sql.strip() == "select 1 as col"
    assert compiled.source_sql.strip().startswith("select")
    assert compiled.compiled_sql_checksum == hashlib.sha256("select 1 as col".encode("utf-8")).hexdigest()
    assert compiled.original_file_path == "models/one.sql"


def test_execute_model_uses_compiled_sql(tmp_path: Path) -> None:
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{tmp_path}/app.db")
    reset_database()
    warehouse_url = f"sqlite:///{tmp_path}/warehouse.db"

    manifest = {
        "metadata": {"target": {"name": "dev"}},
        "nodes": {
            "model.test.one": {
                "resource_type": "model",
                "name": "one",
                "alias": "one",
                "database": "main",
                "schema": "",
                "compiled_code": "select 1 as value",
                "raw_code": "select {{ 1 }} as value",
            }
        },
    }
    write_artifact(tmp_path, "manifest.json", manifest)

    # Prepare environment with workspace scoped connection URL
    db = SessionLocal()
    try:
        env = db_models.Environment(
            name="dev",
            description="",
            dbt_target_name="dev",
            variables={"sql_workspace_connection_url": warehouse_url},
            created_at=None,
            updated_at=None,
            workspace_id=None,
        )
        db.add(env)
        db.commit()
        db.refresh(env)
        environment_id = env.id
    finally:
        db.close()

    settings = Settings(dbt_artifacts_path=str(tmp_path))
    service = SqlWorkspaceService(str(tmp_path), workspace_id=None, settings=settings)

    result = service.execute_model(
        DbtModelExecuteRequest(
            model_unique_id="model.test.one",
            environment_id=environment_id,
            row_limit=10,
            include_profiling=True,
        )
    )

    assert result.model_ref == "model.test.one"
    assert result.compiled_sql_checksum is not None
    assert result.rows[0]["value"] == 1
    assert result.mode == "model"


def test_compiled_sql_rejects_target_mismatch(tmp_path: Path) -> None:
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{tmp_path}/app.db")
    reset_database()
    manifest = {
        "metadata": {"target": {"name": "dev"}},
        "nodes": {
            "model.test.one": {
                "resource_type": "model",
                "name": "one",
                "compiled_code": "select 1",
            }
        },
    }
    write_artifact(tmp_path, "manifest.json", manifest)

    db = SessionLocal()
    try:
        env = db_models.Environment(
            name="prod",
            description="",
            dbt_target_name="prod",
            variables={},
            created_at=None,
            updated_at=None,
            workspace_id=None,
        )
        db.add(env)
        db.commit()
        db.refresh(env)
        environment_id = env.id
    finally:
        db.close()

    service = create_service(tmp_path)

    try:
        service.get_compiled_sql("model.test.one", environment_id)
    except ValueError as exc:
        assert "Manifest target" in str(exc)
    else:
        raise AssertionError("Expected target mismatch to raise ValueError")
