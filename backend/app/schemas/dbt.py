from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, protected_namespaces=())

    id: int
    unique_id: str
    name: str
    schema_: str = Field(..., alias="schema")
    database: str
    resource_type: str
    columns: dict
    tags: List[str] = Field(default_factory=list)
    checksum: str
    timestamp: datetime
    run_id: int


class LineageNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True, protected_namespaces=())

    id: str
    label: str
    type: str
    database: Optional[str] = None
    schema_: Optional[str] = Field(default=None, alias="schema")
    tags: List[str] = Field(default_factory=list)


class LineageEdge(BaseModel):
    source: str
    target: str


class LineageGroup(BaseModel):
    id: str
    label: str
    type: str
    members: List[str] = Field(default_factory=list)


class LineageGraph(BaseModel):
    nodes: List[LineageNode]
    edges: List[LineageEdge]
    groups: List[LineageGroup] = Field(default_factory=list)


class ColumnNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True, protected_namespaces=())

    id: str
    column: str
    model_id: str
    label: str
    type: str
    database: Optional[str] = None
    schema_: Optional[str] = Field(default=None, alias="schema")
    tags: List[str] = Field(default_factory=list)
    data_type: Optional[str] = None
    description: Optional[str] = None


class ColumnLineageEdge(BaseModel):
    source: str
    target: str
    source_column: str
    target_column: str


class ColumnLineageGraph(BaseModel):
    nodes: List[ColumnNode]
    edges: List[ColumnLineageEdge]


class ImpactResponse(BaseModel):
    upstream: List[str]
    downstream: List[str]


class ModelImpactResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, protected_namespaces=())
    model_id: str
    impact: ImpactResponse


class ColumnImpactResponse(BaseModel):
    column_id: str
    impact: ImpactResponse


class ModelLineageDetail(BaseModel):
    model_config = ConfigDict(populate_by_name=True, protected_namespaces=())

    model_id: str
    parents: List[str] = Field(default_factory=list)
    children: List[str] = Field(default_factory=list)
    columns: Dict[str, Dict[str, Optional[str]]] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    schema_: Optional[str] = Field(default=None, alias="schema")
    database: Optional[str] = None


class Run(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    run_id: str
    command: str
    timestamp: datetime
    status: str
    summary: dict
