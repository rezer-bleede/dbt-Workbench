from fastapi import APIRouter, Depends

from app.core.auth import WorkspaceContext, get_current_user, get_current_workspace
from app.schemas.responses import Project

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/projects", response_model=list[Project])
def list_projects(
    workspace: WorkspaceContext = Depends(get_current_workspace),
) -> list[Project]:
    # Expose workspaces as "projects" for backward compatibility
    return [
        Project(
            id=str(workspace.id or workspace.key),
            name=workspace.name,
        )
    ]
