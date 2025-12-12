from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import artifacts, catalog, health, lineage, models, projects, runs, execution, diff, schedules, sql_workspace
from app.core.config import get_settings
from app.core.watcher_manager import start_watcher, stop_watcher
from app.core.scheduler_manager import start_scheduler, stop_scheduler
from app.database.connection import engine, Base
import app.database.models.models


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Base.metadata.create_all(bind=engine)
    start_watcher()
    await start_scheduler()
    yield
    # Shutdown
    await stop_scheduler()
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
app.include_router(diff.router)
app.include_router(schedules.router)
app.include_router(sql_workspace.router)
app.include_router(catalog.router)

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
        "lineage": {
            "default_grouping_mode": settings.default_grouping_mode,
            "max_initial_depth": settings.max_initial_lineage_depth,
            "load_column_lineage_by_default": settings.load_column_lineage_by_default,
            "performance_mode": settings.lineage_performance_mode,
        },
        "execution": {
            "dbt_project_path": settings.dbt_project_path,
            "max_concurrent_runs": settings.max_concurrent_runs,
            "max_run_history": settings.max_run_history,
            "max_artifact_sets": settings.max_artifact_sets,
            "log_buffer_size": settings.log_buffer_size
        },
        "catalog": {
            "allow_metadata_edits": settings.allow_metadata_edits,
            "search_indexing_frequency_seconds": settings.search_indexing_frequency_seconds,
            "freshness_threshold_override_minutes": settings.freshness_threshold_override_minutes,
            "validation_severity": settings.validation_severity,
            "statistics_refresh_policy": settings.statistics_refresh_policy,
        }
    }


@app.get("/")
def root():
    return {"message": "dbt-Workbench API", "version": settings.backend_version}
