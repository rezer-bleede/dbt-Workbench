from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.auth import WorkspaceContext, get_current_user, get_current_workspace
from app.core.config import Settings, get_settings
from app.schemas import dbt as dbt_schemas
from app.services.artifact_service import ArtifactService
from app.services.lineage_service import LineageService

router = APIRouter(dependencies=[Depends(get_current_user)])


def get_lineage_service(
    settings: Settings = Depends(get_settings),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> LineageService:
    artifact_service = ArtifactService(workspace.artifacts_path or settings.dbt_artifacts_path)
    return LineageService(artifact_service, settings)


@router.get("/lineage/graph", response_model=dbt_schemas.LineageGraph)
def get_lineage(
    max_depth: int = Query(None, description="Maximum traversal depth for the lineage graph"),
    service: LineageService = Depends(get_lineage_service),
):
    graph = service.build_model_graph(max_depth=max_depth)
    return graph


@router.get("/lineage/graph/{run_id}", response_model=dbt_schemas.LineageGraph)
def get_lineage_for_run(
    run_id: int,
    max_depth: int = Query(None, description="Maximum traversal depth for the lineage graph"),
    service: LineageService = Depends(get_lineage_service),
):
    _ = run_id  # reserved for compatibility
    graph = service.build_model_graph(max_depth=max_depth)
    return graph


@router.get("/lineage/columns", response_model=dbt_schemas.ColumnLineageGraph)
def get_column_lineage(service: LineageService = Depends(get_lineage_service)):
    return service.build_column_graph()


@router.get("/lineage/groups", response_model=list[dbt_schemas.LineageGroup])
def get_lineage_groups(service: LineageService = Depends(get_lineage_service)):
    return service.get_grouping_metadata()


@router.get("/lineage/model/{model_id}", response_model=dbt_schemas.ModelLineageDetail)
def get_model_lineage(model_id: str, service: LineageService = Depends(get_lineage_service)):
    return service.get_model_lineage(model_id)


@router.get("/lineage/upstream/{node_id}", response_model=dbt_schemas.ImpactResponse)
def get_upstream(node_id: str, column: Optional[str] = Query(None), service: LineageService = Depends(get_lineage_service)):
    if column:
        target = f"{node_id}.{column}" if "." not in column else column
        return service.get_column_impact(target).impact
    return service.get_model_impact(node_id).impact


@router.get("/lineage/downstream/{node_id}", response_model=dbt_schemas.ImpactResponse)
def get_downstream(node_id: str, column: Optional[str] = Query(None), service: LineageService = Depends(get_lineage_service)):
    if column:
        target = f"{node_id}.{column}" if "." not in column else column
        impact = service.get_column_impact(target).impact
    else:
        impact = service.get_model_impact(node_id).impact
    return impact
