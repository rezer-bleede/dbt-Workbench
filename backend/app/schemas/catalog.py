from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TestStatus(BaseModel):
    name: str
    status: str = Field(description="Test execution status")
    severity: Optional[str] = None


class ColumnStatistics(BaseModel):
    null_count: Optional[float] = None
    distinct_count: Optional[float] = None
    min: Optional[Any] = None
    max: Optional[Any] = None
    distribution: Optional[Dict[str, Any]] = None


class ColumnMetadata(BaseModel):
    name: str
    description: Optional[str] = None
    user_description: Optional[str] = None
    type: Optional[str] = None
    is_nullable: Optional[bool] = None
    owner: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    user_tags: List[str] = Field(default_factory=list)
    statistics: Optional[ColumnStatistics] = None
    tests: List[TestStatus] = Field(default_factory=list)


class FreshnessInfo(BaseModel):
    max_loaded_at: Optional[str] = None
    age_minutes: Optional[float] = None
    threshold_minutes: Optional[float] = None
    status: Optional[str] = None
    checked_at: Optional[datetime] = None


class CatalogEntitySummary(BaseModel):
    unique_id: str
    name: str
    resource_type: str
    database: Optional[str] = None
    schema_: Optional[str] = Field(None, alias="schema")
    tags: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    user_owner: Optional[str] = None
    description: Optional[str] = None
    user_description: Optional[str] = None
    user_tags: List[str] = Field(default_factory=list)
    test_status: Optional[str] = None
    freshness: Optional[FreshnessInfo] = None

    class Config:
        populate_by_name = True


class CatalogEntityDetail(CatalogEntitySummary):
    columns: List[ColumnMetadata] = Field(default_factory=list)
    tests: List[TestStatus] = Field(default_factory=list)
    doc_path: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class SearchResult(BaseModel):
    unique_id: str
    name: str
    resource_type: str
    score: float
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    test_status: Optional[str] = None
    freshness: Optional[FreshnessInfo] = None


class SearchResponse(BaseModel):
    query: str
    results: Dict[str, List[SearchResult]] = Field(default_factory=dict)


class MetadataUpdate(BaseModel):
    owner: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    custom_metadata: Optional[Dict[str, Any]] = None


class ColumnMetadataUpdate(BaseModel):
    description: Optional[str] = None
    owner: Optional[str] = None
    tags: Optional[List[str]] = None
    custom_metadata: Optional[Dict[str, Any]] = None


class ValidationIssue(BaseModel):
    unique_id: str
    entity_name: str
    entity_type: str
    severity: str
    message: str


class ValidationResponse(BaseModel):
    issues: List[ValidationIssue]

