from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import artifacts, health, lineage, models, projects, runs, execution
from app.core.config import get_settings
from app.core.watcher_manager import start_watcher, stop_watcher


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_watcher()
    yield
    # Shutdown
    stop_watcher()


settings = get_settings()

app = FastAPI(
    title="dbt-Workbench API", 
    version=settings.backend_version,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(projects.router)
app.include_router(artifacts.router)
app.include_router(models.router)
app.include_router(lineage.router)
app.include_router(runs.router)
app.include_router(execution.router)

@app.get("/config")
async def get_config():
    """Get application configuration."""
    return {
        "artifact_watcher": {
            "max_versions": settings.max_artifact_versions,
            "monitored_files": settings.monitored_artifact_files,
            "polling_interval": settings.artifact_polling_interval
        },
        "artifacts_path": settings.dbt_artifacts_path,
        "execution": {
            "dbt_project_path": settings.dbt_project_path,
            "max_concurrent_runs": settings.max_concurrent_runs,
            "max_run_history": settings.max_run_history,
            "max_artifact_sets": settings.max_artifact_sets,
            "log_buffer_size": settings.log_buffer_size
        }
    }


@app.get("/")
def root():
    return {"message": "dbt-Workbench API", "version": settings.backend_version}
