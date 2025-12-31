import hashlib
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings, get_settings
from app.database.connection import SessionLocal
from app.database.models import models as db_models
from app.schemas.sql_workspace import (
    AutocompleteMetadataResponse,
    CompiledSqlResponse,
    DbtModelExecuteRequest,
    ModelPreviewRequest,
    ModelPreviewResponse,
    RelationColumn,
    RelationInfo,
    SqlColumnMetadata,
    SqlColumnProfile,
    SqlQueryHistoryEntry,
    SqlQueryHistoryResponse,
    SqlQueryProfile,
    SqlQueryRequest,
    SqlQueryResult,
)


@dataclass
class ActiveQuery:
    cancel_event: threading.Event
    started_at: datetime
    environment_id: Optional[int]


class SqlWorkspaceService:
    def __init__(
        self,
        artifacts_path: str,
        workspace_id: Optional[int] = None,
        settings: Optional[Settings] = None,
    ):
        from app.services.artifact_service import ArtifactService

        self.settings = settings or get_settings()
        self.artifact_service = ArtifactService(artifacts_path)
        self.workspace_id = workspace_id
        self._engines: Dict[str, Engine] = {}
        self._engines_lock = threading.Lock()
        self._active_queries: Dict[str, ActiveQuery] = {}

    # ---- Engine and environment helpers ----

    def _get_default_environment(self) -> Optional[db_models.Environment]:
        if self.workspace_id is None:
            return None
        db = SessionLocal()
        try:
            env = (
                db.query(db_models.Environment)
                .filter(db_models.Environment.workspace_id == self.workspace_id)
                .order_by(db_models.Environment.id)
                .first()
            )
            if env:
                return env
            now = datetime.utcnow()
            env = db_models.Environment(
                name="default",
                description="Default environment",
                dbt_target_name=None,
                connection_profile_reference=None,
                variables={},
                default_retention_policy=None,
                created_at=now,
                updated_at=now,
                workspace_id=self.workspace_id,
            )
            db.add(env)
            db.commit()
            db.refresh(env)
            return env
        finally:
            db.close()

    def _get_environment(self, environment_id: Optional[int]) -> Optional[db_models.Environment]:
        if environment_id is None:
            return self._get_default_environment()
        db = SessionLocal()
        try:
            query = db.query(db_models.Environment).filter(db_models.Environment.id == environment_id)
            if self.workspace_id is not None:
                query = query.filter(db_models.Environment.workspace_id == self.workspace_id)
            env = query.first()
            if env is None and self.workspace_id is not None:
                raise ValueError("Environment does not belong to the active workspace")
            return env
        finally:
            db.close()

    def _get_connection_url(self, environment: Optional[db_models.Environment]) -> str:
        if environment and isinstance(environment.variables, dict):
            variables = environment.variables or {}
            for key in ("sql_workspace_connection_url", "warehouse_connection_url"):
                url = variables.get(key)
                if isinstance(url, str) and url:
                    return url

        if self.settings.sql_workspace_default_connection_url:
            return self.settings.sql_workspace_default_connection_url

        raise ValueError("No SQL workspace connection URL configured")

    def _get_engine(self, connection_url: str) -> Engine:
        with self._engines_lock:
            engine = self._engines.get(connection_url)
            if engine is None:
                engine = create_engine(connection_url)
                self._engines[connection_url] = engine
            return engine

    # ---- Safety checks ----

    def _is_destructive(self, sql: str) -> bool:
        normalized = " ".join(sql.strip().lower().split())
        destructive_keywords = (
            "drop ",
            "alter ",
            "truncate ",
            "create ",
            "rename ",
            "grant ",
            "revoke ",
            "delete ",
        )
        return any(k in normalized for k in destructive_keywords)

    def _validate_query_allowed(self, sql: str, environment: Optional[db_models.Environment]) -> None:
        allow_destructive = self.settings.sql_workspace_allow_destructive_default
        if environment and isinstance(environment.variables, dict):
            variables = environment.variables or {}
            env_flag = variables.get("sql_workspace_allow_destructive")
            if isinstance(env_flag, bool):
                allow_destructive = env_flag

        if not allow_destructive and self._is_destructive(sql):
            raise PermissionError("Destructive SQL statements are not allowed in this environment")

    # ---- Metadata helpers ----

    def _load_artifacts(self) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        manifest = self.artifact_service.get_manifest() or {}
        catalog = self.artifact_service.get_catalog() or {}
        return manifest, catalog

    def _compiled_checksum(self, sql: str) -> str:
        return hashlib.sha256(sql.encode("utf-8")).hexdigest()

    def _merged_nodes(self, manifest: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        nodes = dict(manifest.get("nodes", {}))
        nodes.update(manifest.get("sources", {}))
        return nodes

    def _catalog_nodes(self, catalog: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        nodes = dict(catalog.get("nodes", {}))
        nodes.update(catalog.get("sources", {}))
        return nodes

    def _collect_columns(
        self,
        manifest_nodes: Dict[str, Dict[str, Any]],
        catalog_nodes: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Dict[str, Dict[str, Any]]]:
        columns: Dict[str, Dict[str, Dict[str, Any]]] = {}
        for unique_id, node in manifest_nodes.items():
            manifest_columns = node.get("columns", {}) or {}
            catalog_columns = catalog_nodes.get(unique_id, {}).get("columns", {}) or {}
            names = set(manifest_columns.keys()) | set(catalog_columns.keys())
            merged_columns: Dict[str, Dict[str, Any]] = {}
            for name in sorted(names):
                manifest_meta = manifest_columns.get(name, {})
                catalog_meta = catalog_columns.get(name, {})
                merged_columns[name] = {
                    "name": manifest_meta.get("name") or catalog_meta.get("name") or name,
                    "description": manifest_meta.get("description") or catalog_meta.get("comment"),
                    "type": catalog_meta.get("type") or manifest_meta.get("data_type"),
                    "tags": manifest_meta.get("tags", []),
                    "is_nullable": catalog_meta.get("nullable"),
                }
            columns[unique_id] = merged_columns
        return columns

    def get_autocomplete_metadata(self) -> AutocompleteMetadataResponse:
        manifest, catalog = self._load_artifacts()
        manifest_nodes = self._merged_nodes(manifest)
        catalog_nodes = self._catalog_nodes(catalog)
        columns_by_node = self._collect_columns(manifest_nodes, catalog_nodes)

        models: List[RelationInfo] = []
        sources: List[RelationInfo] = []
        schemas: Dict[str, List[RelationInfo]] = {}

        for unique_id, node in manifest_nodes.items():
            resource_type = node.get("resource_type", "model")
            name = node.get("alias") or node.get("name")
            database = node.get("database")
            schema = node.get("schema")
            parts = [p for p in [database, schema, name] if p]
            relation_name = ".".join(parts) or name
            cols_meta = columns_by_node.get(unique_id, {})
            cols = [
                RelationColumn(
                    name=col_name,
                    data_type=meta.get("type"),
                    is_nullable=meta.get("is_nullable"),
                )
                for col_name, meta in sorted(cols_meta.items())
            ]
            info = RelationInfo(
                unique_id=unique_id,
                name=name,
                schema=schema,
                database=database,
                relation_name=relation_name,
                resource_type=resource_type,
                columns=cols,
                tags=node.get("tags", []),
                meta=node.get("meta", {}),
                original_file_path=node.get("original_file_path"),
            )

            schema_key = ".".join([p for p in [database, schema] if p]) or "default"
            schemas.setdefault(schema_key, []).append(info)

            if resource_type in ("model", "seed"):
                models.append(info)
            elif resource_type == "source":
                sources.append(info)

        return AutocompleteMetadataResponse(
            models=models,
            sources=sources,
            schemas=schemas,
        )

    # ---- Execution and profiling ----

    def _execute_query_sync(
        self,
        engine: Engine,
        query_id: str,
        sql: str,
        row_limit: int,
        timeout_seconds: int,
        cancel_event: threading.Event,
    ) -> Tuple[List[Dict[str, Any]], List[SqlColumnMetadata], int, bool]:
        start = time.monotonic()
        rows: List[Dict[str, Any]] = []
        columns: List[SqlColumnMetadata] = []
        truncated = False

        try:
            with engine.connect() as conn:
                result = conn.execution_options(stream_results=True).execute(text(sql))

                col_names = list(result.keys())
                columns = [SqlColumnMetadata(name=name) for name in col_names]

                chunk_size = 256
                while True:
                    if cancel_event.is_set():
                        raise QueryCancelledError()

                    elapsed = time.monotonic() - start
                    if elapsed > timeout_seconds:
                        raise QueryTimeoutError()

                    chunk = result.fetchmany(chunk_size)
                    if not chunk:
                        break

                    for row in chunk:
                        rows.append(dict(row._mapping))
                        if len(rows) >= row_limit:
                            truncated = True
                            break

                    if len(rows) >= row_limit:
                        break
        finally:
            with self._engines_lock:
                self._active_queries.pop(query_id, None)

        execution_time_ms = int((time.monotonic() - start) * 1000)
        return rows, columns, execution_time_ms, truncated

    def _build_profile(self, rows: List[Dict[str, Any]]) -> SqlQueryProfile:
        if not rows:
            return SqlQueryProfile(row_count=0, columns=[])

        column_names = list(rows[0].keys())
        profiles: List[SqlColumnProfile] = []

        for name in column_names:
            values = [row.get(name) for row in rows]
            null_count = sum(1 for v in values if v is None)
            non_null_values = [v for v in values if v is not None]

            min_value = None
            max_value = None
            if non_null_values:
                try:
                    min_value = min(non_null_values)
                    max_value = max(non_null_values)
                except TypeError:
                    min_value = None
                    max_value = None

            distinct_count = None
            try:
                distinct_count = len(set(non_null_values))
            except TypeError:
                distinct_count = None

            sample_values = non_null_values[:10]

            profiles.append(
                SqlColumnProfile(
                    column_name=name,
                    null_count=null_count,
                    min_value=min_value,
                    max_value=max_value,
                    distinct_count=distinct_count,
                    sample_values=sample_values,
                )
            )

        return SqlQueryProfile(row_count=len(rows), columns=profiles)

    def execute_query(self, request: SqlQueryRequest) -> SqlQueryResult:
        environment = self._get_environment(request.environment_id)
        environment_id = environment.id if environment else request.environment_id
        self._validate_query_allowed(request.sql, environment)

        connection_url = self._get_connection_url(environment)
        engine = self._get_engine(connection_url)

        max_rows = self.settings.sql_workspace_max_rows
        row_limit = max_rows if request.row_limit is None else min(request.row_limit, max_rows)
        timeout_seconds = self.settings.sql_workspace_timeout_seconds

        db = SessionLocal()
        try:
            now = datetime.utcnow()
            db_query = db_models.SqlQuery(
                created_at=now,
                updated_at=now,
                environment_id=environment_id,
                query_text=request.sql,
                status="running",
                model_ref=request.model_ref,
                compiled_sql=request.compiled_sql,
                compiled_sql_checksum=request.compiled_sql_checksum,
                source_sql=request.source_sql,
                execution_mode=request.mode or "sql",
            )
            db.add(db_query)
            db.commit()
            db.refresh(db_query)
            query_id = str(db_query.id)
        finally:
            db.close()

        cancel_event = threading.Event()
        self._active_queries[query_id] = ActiveQuery(
            cancel_event=cancel_event,
            started_at=datetime.utcnow(),
            environment_id=environment_id,
        )

        try:
            rows, columns, execution_time_ms, truncated = self._execute_query_sync(
                engine=engine,
                query_id=query_id,
                sql=request.sql,
                row_limit=row_limit,
                timeout_seconds=timeout_seconds,
                cancel_event=cancel_event,
            )
            profiling: Optional[SqlQueryProfile] = None
            if request.include_profiling:
                profiling = self._build_profile(rows)

            db = SessionLocal()
            try:
                db_query = db.query(db_models.SqlQuery).filter(db_models.SqlQuery.id == int(query_id)).first()
                if db_query:
                    db_query.status = "cancelled" if cancel_event.is_set() else "success"
                    db_query.updated_at = datetime.utcnow()
                    db_query.execution_time_ms = execution_time_ms
                    db_query.row_count = len(rows)
                    db_query.truncated = truncated
                    db.add(db_query)
                    db.commit()
            finally:
                db.close()

            return SqlQueryResult(
                query_id=query_id,
                rows=rows,
                columns=columns,
                execution_time_ms=execution_time_ms,
                row_count=len(rows),
                truncated=truncated,
                profiling=profiling,
                compiled_sql_checksum=request.compiled_sql_checksum,
                model_ref=request.model_ref,
                mode=request.mode or "sql",
            )
        except QueryCancelledError:
            db = SessionLocal()
            try:
                db_query = db.query(db_models.SqlQuery).filter(db_models.SqlQuery.id == int(query_id)).first()
                if db_query:
                    db_query.status = "cancelled"
                    db_query.updated_at = datetime.utcnow()
                    db.add(db_query)
                    db.commit()
            finally:
                db.close()
            raise
        except QueryTimeoutError as exc:
            db = SessionLocal()
            try:
                db_query = db.query(db_models.SqlQuery).filter(db_models.SqlQuery.id == int(query_id)).first()
                if db_query:
                    db_query.status = "timeout"
                    db_query.updated_at = datetime.utcnow()
                    db.add(db_query)
                    db.commit()
            finally:
                db.close()
            raise exc
        except SQLAlchemyError as exc:
            db = SessionLocal()
            try:
                db_query = db.query(db_models.SqlQuery).filter(db_models.SqlQuery.id == int(query_id)).first()
                if db_query:
                    db_query.status = "error"
                    db_query.updated_at = datetime.utcnow()
                    db_query.error_message = str(exc)
                    db.add(db_query)
                    db.commit()
            finally:
                db.close()
            raise

    def get_compiled_sql(self, model_unique_id: str, environment_id: Optional[int] = None) -> CompiledSqlResponse:
        manifest, _ = self._load_artifacts()
        if not manifest:
            raise ValueError("No manifest available. Refresh dbt artifacts.")

        manifest_nodes = self._merged_nodes(manifest)
        node = manifest_nodes.get(model_unique_id)
        if not node or node.get("resource_type") != "model":
            raise ValueError("Model not found in manifest")

        target_name = manifest.get("metadata", {}).get("target", {}).get("name")
        environment = self._get_environment(environment_id)
        if environment and environment.dbt_target_name and target_name:
            if environment.dbt_target_name != target_name:
                raise ValueError(
                    f"Manifest target '{target_name}' does not match environment target '{environment.dbt_target_name}'."
                )

        compiled_sql = node.get("compiled_code") or node.get("compiled_sql")
        source_sql = node.get("raw_code") or node.get("raw_sql") or ""
        if not compiled_sql:
            raise ValueError("Compiled SQL not available for this model. Ensure dbt artifacts are built.")

        checksum = self._compiled_checksum(compiled_sql)

        return CompiledSqlResponse(
            model_unique_id=model_unique_id,
            environment_id=environment.id if environment else environment_id,
            compiled_sql=compiled_sql,
            source_sql=source_sql,
            compiled_sql_checksum=checksum,
            target_name=target_name,
            original_file_path=node.get("original_file_path"),
        )

    def execute_model(self, request: DbtModelExecuteRequest) -> SqlQueryResult:
        compiled = self.get_compiled_sql(request.model_unique_id, request.environment_id)
        query_request = SqlQueryRequest(
            sql=compiled.compiled_sql,
            environment_id=compiled.environment_id,
            row_limit=request.row_limit,
            include_profiling=request.include_profiling,
            mode="model",
            model_ref=request.model_unique_id,
            compiled_sql=compiled.compiled_sql,
            compiled_sql_checksum=compiled.compiled_sql_checksum,
            source_sql=compiled.source_sql,
        )
        return self.execute_query(query_request)

    def preview_model(self, request: ModelPreviewRequest) -> ModelPreviewResponse:
        manifest, catalog = self._load_artifacts()
        manifest_nodes = self._merged_nodes(manifest)

        node = manifest_nodes.get(request.model_unique_id)
        if not node:
            raise ValueError("Model not found in manifest")

        name = node.get("alias") or node.get("name")
        database = node.get("database")
        schema = node.get("schema")
        parts = [p for p in [database, schema, name] if p]
        relation_name = ".".join(parts) or name

        max_rows = self.settings.sql_workspace_max_rows
        limit = max_rows if request.row_limit is None else min(request.row_limit, max_rows)
        sql = f"SELECT * FROM {relation_name} LIMIT {limit}"

        query_request = SqlQueryRequest(
            sql=sql,
            environment_id=request.environment_id,
            row_limit=limit,
            include_profiling=request.include_profiling,
            mode="preview",
            model_ref=request.model_unique_id,
        )
        result = self.execute_query(query_request)

        catalog_nodes = self._catalog_nodes(catalog)
        catalog_entry = catalog_nodes.get(request.model_unique_id, {})
        catalog_columns = catalog_entry.get("columns", {}) or {}
        column_meta: Dict[str, Dict[str, Any]] = {
            name: meta for name, meta in catalog_columns.items()
        }

        enriched_columns: List[SqlColumnMetadata] = []
        for col in result.columns:
            meta = column_meta.get(col.name) or {}
            enriched_columns.append(
                SqlColumnMetadata(
                    name=col.name,
                    data_type=meta.get("type") or col.data_type,
                    is_nullable=meta.get("nullable", col.is_nullable),
                )
            )

        return ModelPreviewResponse(
            query_id=result.query_id,
            model_unique_id=request.model_unique_id,
            rows=result.rows,
            columns=enriched_columns,
            execution_time_ms=result.execution_time_ms,
            row_count=result.row_count,
            truncated=result.truncated,
            profiling=result.profiling,
        )

    def cancel_query(self, query_id: str) -> bool:
        active = self._active_queries.get(query_id)
        if not active:
            return False
        active.cancel_event.set()
        return True

    def get_history(
        self,
        *,
        environment_id: Optional[int] = None,
        model_ref: Optional[str] = None,
        status: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> SqlQueryHistoryResponse:
        db = SessionLocal()
        try:
            query = db.query(db_models.SqlQuery, db_models.Environment).outerjoin(
                db_models.Environment,
                db_models.SqlQuery.environment_id == db_models.Environment.id,
            )

            if self.workspace_id is not None:
                query = query.filter(db_models.Environment.workspace_id == self.workspace_id)

            if environment_id is not None:
                query = query.filter(db_models.SqlQuery.environment_id == environment_id)
            if model_ref:
                query = query.filter(db_models.SqlQuery.model_ref == model_ref)
            if status:
                query = query.filter(db_models.SqlQuery.status == status)
            if start_time:
                query = query.filter(db_models.SqlQuery.created_at >= start_time)
            if end_time:
                query = query.filter(db_models.SqlQuery.created_at <= end_time)

            total_count = query.count()
            query = query.order_by(db_models.SqlQuery.created_at.desc())
            query = query.offset((page - 1) * page_size).limit(page_size)

            items: List[SqlQueryHistoryEntry] = []
            for sql_query, environment in query.all():
                items.append(
                    SqlQueryHistoryEntry(
                        id=sql_query.id,
                        created_at=sql_query.created_at,
                        environment_id=sql_query.environment_id,
                        environment_name=environment.name if environment else None,
                        query_text=sql_query.query_text,
                        status=sql_query.status,
                        row_count=sql_query.row_count,
                        execution_time_ms=sql_query.execution_time_ms,
                        model_ref=sql_query.model_ref,
                        compiled_sql_checksum=sql_query.compiled_sql_checksum,
                        mode=sql_query.execution_mode,
                    )
                )

            return SqlQueryHistoryResponse(
                items=items,
                total_count=total_count,
                page=page,
                page_size=page_size,
            )
        finally:
            db.close()

    def delete_history_entry(self, entry_id: int) -> bool:
        db = SessionLocal()
        try:
            query = (
                db.query(db_models.SqlQuery)
                .outerjoin(
                    db_models.Environment,
                    db_models.SqlQuery.environment_id == db_models.Environment.id,
                )
                .filter(db_models.SqlQuery.id == entry_id)
            )
            if self.workspace_id is not None:
                query = query.filter(db_models.Environment.workspace_id == self.workspace_id)

            obj = query.first()
            if not obj:
                return False
            db.delete(obj)
            db.commit()
            return True
        finally:
            db.close()


class QueryCancelledError(Exception):
    pass


class QueryTimeoutError(Exception):
    pass


_default_sql_workspace_service = SqlWorkspaceService(get_settings().dbt_artifacts_path, workspace_id=None)


_sql_services_by_path: dict[tuple[str, Optional[int]], SqlWorkspaceService] = {}


def get_sql_workspace_service_for_path(artifacts_path: str, workspace_id: Optional[int]) -> SqlWorkspaceService:
    key = (artifacts_path, workspace_id)
    service = _sql_services_by_path.get(key)
    if service is None:
        service = SqlWorkspaceService(artifacts_path, workspace_id=workspace_id)
        _sql_services_by_path[key] = service
    return service


def get_default_sql_workspace_service() -> SqlWorkspaceService:
    return get_sql_workspace_service_for_path(get_settings().dbt_artifacts_path, workspace_id=None)
