from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class SqlColumnMetadata(BaseModel):
    name: str
    data_type: Optional[str] = None
    is_nullable: Optional[bool] = None


class SqlQueryRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    sql: str
    environment_id: Optional[int] = None
    row_limit: Optional[int] = None
    include_profiling: bool = False
    mode: str = Field(default="sql", description="sql | preview | model")
    model_ref: Optional[str] = None
    compiled_sql: Optional[str] = None
    compiled_sql_checksum: Optional[str] = None
    source_sql: Optional[str] = None


class SqlQueryResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    query_id: str
    rows: List[Dict[str, Any]]
    columns: List[SqlColumnMetadata]
    execution_time_ms: int
    row_count: int
    truncated: bool = False
    profiling: Optional["SqlQueryProfile"] = None
    compiled_sql_checksum: Optional[str] = None
    model_ref: Optional[str] = None
    mode: Optional[str] = None


class SqlErrorResponse(BaseModel):
    message: str
    code: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class SqlColumnProfile(BaseModel):
    column_name: str
    null_count: Optional[int] = None
    min_value: Optional[Any] = None
    max_value: Optional[Any] = None
    distinct_count: Optional[int] = None
    sample_values: List[Any] = Field(default_factory=list)


class SqlQueryProfile(BaseModel):
    row_count: int
    columns: List[SqlColumnProfile]


SqlQueryResult.model_rebuild()


class SqlQueryHistoryEntry(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: int
    created_at: datetime
    environment_id: Optional[int] = None
    environment_name: Optional[str] = None
    query_text: str
    status: str
    row_count: Optional[int] = None
    execution_time_ms: Optional[int] = None
    model_ref: Optional[str] = None
    compiled_sql_checksum: Optional[str] = None
    mode: Optional[str] = None


class SqlQueryHistoryResponse(BaseModel):
    items: List[SqlQueryHistoryEntry]
    total_count: int
    page: int
    page_size: int


class RelationColumn(BaseModel):
    name: str
    data_type: Optional[str] = None
    is_nullable: Optional[bool] = None


class RelationInfo(BaseModel):
    unique_id: Optional[str] = None
    name: str
    schema_: Optional[str] = Field(default=None, alias="schema")
    database: Optional[str] = None
    relation_name: str
    resource_type: str
    columns: List[RelationColumn] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)
    original_file_path: Optional[str] = None


class AutocompleteMetadataResponse(BaseModel):
    models: List[RelationInfo] = Field(default_factory=list)
    sources: List[RelationInfo] = Field(default_factory=list)
    schemas: Dict[str, List[RelationInfo]] = Field(default_factory=dict)


class ModelPreviewRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_unique_id: str
    environment_id: Optional[int] = None
    row_limit: Optional[int] = None
    include_profiling: bool = False


class ModelPreviewResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    query_id: str
    model_unique_id: str
    rows: List[Dict[str, Any]]
    columns: List[SqlColumnMetadata]
    execution_time_ms: int
    row_count: int
    truncated: bool = False
    profiling: Optional[SqlQueryProfile] = None


class CompiledSqlResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_unique_id: str
    environment_id: Optional[int] = None
    compiled_sql: str
    source_sql: str
    compiled_sql_checksum: str
    target_name: Optional[str] = None
    original_file_path: Optional[str] = None


class DbtModelExecuteRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_unique_id: Optional[str] = None
    environment_id: Optional[int] = None
    row_limit: Optional[int] = None
    include_profiling: bool = False