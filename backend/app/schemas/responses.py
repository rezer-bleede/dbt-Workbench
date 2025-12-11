from typing import Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class HealthResponse(BaseModel):
    status: str
    backend: str
    version: str


class Project(BaseModel):
    id: str
    name: str


class ArtifactSummary(BaseModel):
    manifest: bool = False
    run_results: bool = False
    catalog: bool = False


class ModelSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, protected_namespaces=())
    unique_id: str
    name: str
    resource_type: str
    depends_on: List[str] = Field(default_factory=list)
    database: Optional[str] = None
    schema_: Optional[str] = Field(default=None, alias="schema")
    alias: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class ModelDetail(ModelSummary):
    description: Optional[str] = ""
    columns: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    children: List[str] = Field(default_factory=list)


class LineageNode(BaseModel):
    id: str
    label: str
    type: str


class LineageEdge(BaseModel):
    source: str
    target: str


class LineageGraph(BaseModel):
    nodes: List[LineageNode]
    edges: List[LineageEdge]


class RunRecord(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    status: Optional[str]
    start_time: Optional[str]
    end_time: Optional[str]
    duration: Optional[float]
    invocation_id: Optional[str]
    model_unique_id: Optional[str]
