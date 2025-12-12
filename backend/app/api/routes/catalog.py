from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import Settings, get_settings
from app.schemas import catalog as catalog_schemas
from app.services.artifact_service import ArtifactService
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/catalog", tags=["catalog"])


def get_service(settings: Settings = Depends(get_settings)) -> CatalogService:
    artifact_service = ArtifactService(settings.dbt_artifacts_path)
    return CatalogService(artifact_service, settings)


@router.get("/entities", response_model=list[catalog_schemas.CatalogEntitySummary])
async def list_entities(service: CatalogService = Depends(get_service)):
    return service.list_entities()


@router.get("/entities/{unique_id}", response_model=catalog_schemas.CatalogEntityDetail)
async def get_entity(unique_id: str, service: CatalogService = Depends(get_service)):
    detail = service.entity_detail(unique_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Entity not found")
    return detail


@router.get("/search", response_model=catalog_schemas.SearchResponse)
async def search_catalog(query: str = Query("", max_length=200), service: CatalogService = Depends(get_service)):
    return service.search(query)


@router.get("/validation", response_model=catalog_schemas.ValidationResponse)
async def validation(service: CatalogService = Depends(get_service)):
    return service.validate()


@router.patch("/entities/{unique_id}", response_model=catalog_schemas.CatalogEntityDetail)
async def update_entity_metadata(
    unique_id: str,
    payload: catalog_schemas.MetadataUpdate,
    service: CatalogService = Depends(get_service),
):
    try:
        return service.update_metadata(unique_id, payload)
    except PermissionError as exc:  # pragma: no cover - fastapi handles coverage differently
        raise HTTPException(status_code=403, detail=str(exc))
    except KeyError:
        raise HTTPException(status_code=404, detail="Entity not found")


@router.patch("/entities/{unique_id}/columns/{column_name}", response_model=list[catalog_schemas.ColumnMetadata])
async def update_column_metadata(
    unique_id: str,
    column_name: str,
    payload: catalog_schemas.ColumnMetadataUpdate,
    service: CatalogService = Depends(get_service),
):
    try:
        return service.update_column_metadata(unique_id, column_name, payload)
    except PermissionError as exc:  # pragma: no cover - fastapi handles coverage differently
        raise HTTPException(status_code=403, detail=str(exc))
    except KeyError:
        raise HTTPException(status_code=404, detail="Entity not found")

