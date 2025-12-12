from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import Role, WorkspaceContext, get_current_user, get_current_workspace, require_role
from app.schemas.sql_workspace import (
    AutocompleteMetadataResponse,
    ModelPreviewRequest,
    ModelPreviewResponse,
    SqlErrorResponse,
    SqlQueryHistoryResponse,
    SqlQueryProfile,
    SqlQueryRequest,
    SqlQueryResult,
)
from app.services.sql_workspace_service import (
    QueryCancelledError,
    QueryTimeoutError,
    SqlWorkspaceService,
    get_sql_workspace_service_for_path,
)

router = APIRouter(prefix="/sql", tags=["sql"], dependencies=[Depends(get_current_user)])


def get_service(
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> SqlWorkspaceService:
    return get_sql_workspace_service_for_path(workspace.artifacts_path)


@router.post(
    "/execute",
    response_model=SqlQueryResult,
    responses={400: {"model": SqlErrorResponse}, 403: {"model": SqlErrorResponse}, 408: {"model": SqlErrorResponse}},
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def execute_sql(
    request: SqlQueryRequest,
    service: SqlWorkspaceService = Depends(get_service),
) -> SqlQueryResult:
    try:
        return service.execute_query(request)
    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail={"message": str(exc), "code": "forbidden"},
        ) from exc
    except QueryTimeoutError as exc:
        raise HTTPException(
            status_code=408,
            detail={"message": "Query execution timed out", "code": "timeout"},
        ) from exc
    except QueryCancelledError as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": "Query was cancelled", "code": "cancelled"},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc), "code": "execution_error"},
        ) from exc


@router.post(
    "/queries/{query_id}/cancel",
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def cancel_sql_query(
    query_id: str,
    service: SqlWorkspaceService = Depends(get_service),
) -> dict:
    cancelled = service.cancel_query(query_id)
    if cancelled:
        return {"query_id": query_id, "status": "cancelled"}
    return {"query_id": query_id, "status": "not_found_or_completed"}


@router.get(
    "/history",
    response_model=SqlQueryHistoryResponse,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def get_sql_history(
    environment_id: Optional[int] = Query(default=None),
    model_ref: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    start_time: Optional[datetime] = Query(default=None),
    end_time: Optional[datetime] = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    service: SqlWorkspaceService = Depends(get_service),
) -> SqlQueryHistoryResponse:
    return service.get_history(
        environment_id=environment_id,
        model_ref=model_ref,
        status=status,
        start_time=start_time,
        end_time=end_time,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/metadata",
    response_model=AutocompleteMetadataResponse,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def get_sql_metadata(
    service: SqlWorkspaceService = Depends(get_service),
) -> AutocompleteMetadataRespo_codensnewe</:
ponse:
    return service.get_autocomplete_metadata()


@router.post(
    "/preview",
    response_model=ModelPreviewResponse,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def preview_model(
    request: ModelPreviewRequest,
    service: SqlWorkspaceService = Depends(get_service),
) -> ModelPreviewResponse:
    try:
        return service.preview_model(request)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail={"message": str(exc), "code": "not_found"},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={"message": str(exc), "code": "preview_error"},
        ) from exc


@router.post(
    "/profile",
    response_model=SqlQueryProfile,
    dependencies=[Depends(require_role(Role.DEVELOPER))],
)
def profile_sql(
    request: SqlQueryRequest,
    service: SqlWorkspaceService = Depends(get_service),
) -> SqlQueryProfile:
    request.include_profiling = True
    result = service.execute_query(request)
    if not result.profiling:
        raise HTTPException(
            status_code=400,
            detail={"message": "Profiling data not available", "code": "profiling_unavailable"},
        )
    return result.profiling


@router.delete("/history/{entry_id}")
def delete_sql_history_entry(
    entry_id: int,
    service: SqlWorkspaceService = Depends(get_service),
) -> dict:
    deleted = service.delete_history_entry(entry_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail={"message": "History entry not found", "code": "not_found"},
        )
    return {"id": entry_id, "status": "deleted"}