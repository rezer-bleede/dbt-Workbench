from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import WorkspaceContext, get_current_user, get_current_workspace
from app.core.config import Settings, get_settings
from app.schemas.responses import ModelDetail, ModelSummary
from app.services.artifact_service import ArtifactService

router = APIRouter(dependencies=[Depends(get_current_user)])


def get_service(
    settings: Settings = Depends(get_settings),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> ArtifactService:
    return ArtifactService(workspace.artifacts_path or settings.dbt_artifacts_path)


@router.get("/models", response_model=list[ModelSummary])
def list_models(service: ArtifactService = Depends(get_service)) -> list[ModelSummary]:
    models = service.list_models()
    return [ModelSummary(**model) for model in models]


@router.get("/models/{model_id}", response_model=ModelDetail)
def get_model(model_id: str, service: ArtifactService = Depends(get_service)) -> ModelDetail:
    model = service.get_model_detail(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return ModelDetail(**model)
