from typing import List, Set
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import WorkspaceContext, get_current_user, get_current_workspace
from app.core.config import Settings, get_settings
from app.database.connection import SessionLocal
from app.schemas.responses import ModelDetail, ModelSummary
from app.schemas.git import FileNode
from app.services.artifact_service import ArtifactService
from app.services import git_service

router = APIRouter(dependencies=[Depends(get_current_user)])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_service(
    settings: Settings = Depends(get_settings),
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> ArtifactService:
    return ArtifactService(workspace.artifacts_path or settings.dbt_artifacts_path)


def _collect_sql_models(nodes: List[FileNode], collected: List[ModelSummary]):
    for node in nodes:
        if node.children:
            _collect_sql_models(node.children, collected)
        elif node.type == "file" and node.name.endswith(".sql"):
            # Simple heuristic: if it's in a "models" category or path contains "models"
            # The git_service categorized "models" top level directory.
            # We can also check if the path starts with "models/"
            is_model = node.category == "models" or (node.path and node.path.startswith("models/"))
            
            if is_model:
                name = node.name.removesuffix(".sql")
                collected.append(
                    ModelSummary(
                        unique_id=f"git.{name}", # Temporary ID for git-only models
                        name=name,
                        resource_type="model",
                        depends_on=[],
                        tags=[],
                        source="git"  # Optional: indicate source if schema allowed (it doesn't seem to have source field, but we can rely on defaults)
                    )
                )


@router.get("/models", response_model=list[ModelSummary])
def list_models(
    service: ArtifactService = Depends(get_service),
    workspace: WorkspaceContext = Depends(get_current_workspace),
    db: Session = Depends(get_db),
) -> list[ModelSummary]:
    # 1. Get models from artifacts (manifest.json)
    artifact_models_data = service.list_models()
    artifact_models = [ModelSummary(**m) for m in artifact_models_data]
    
    # 2. Get models from git repo
    git_models: List[ModelSummary] = []
    try:
        repo = git_service.get_repository(db, workspace.id)
        if repo:
            files = git_service.list_files(db, workspace.id)
            _collect_sql_models(files, git_models)
    except Exception:
        # If git service fails (e.g. repo issue), just ignore git models
        pass

    # 3. Merge: Prefer artifact models over git models by name
    # Create a map of existing names
    existing_names: Set[str] = {m.name for m in artifact_models}
    
    final_models = list(artifact_models)
    for gm in git_models:
        if gm.name not in existing_names:
            final_models.append(gm)
            existing_names.add(gm.name) # Prevent duplicates from git itself if any

    return final_models


@router.get("/models/{model_id}", response_model=ModelDetail)
def get_model(model_id: str, service: ArtifactService = Depends(get_service)) -> ModelDetail:
    # Check for git-only models
    if model_id.startswith("git."):
        name = model_id.removeprefix("git.")
        return ModelDetail(
            unique_id=model_id,
            name=name,
            resource_type="model",
            source="git",
            depends_on=[],
            tags=[],
            description="Model file from git repository (not yet compiled).",
            columns={},
            children=[]
        )

    model = service.get_model_detail(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return ModelDetail(**model)
