import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.api.routes import (
    artifacts,
    auth,
    catalog,
    health,
    lineage,
    models,
    projects,
    runs,
    execution,
    diff,
    schedules,
    sql_workspace,
    workspaces,
    admin,
    plugins,
    plugins,
    git,
    profiles,
)
from app.core.config import get_settings
from app.core.scheduler_manager import start_scheduler, stop_scheduler
from app.core.watcher_manager import start_watcher, stop_watcher
from app.database.connection import Base, SessionLocal, engine
import app.database.models.models  # noqa: F401
from app.services.plugin_service import PluginService
from app.services.project_service import ensure_default_project

logger = logging.getLogger(__name__)


async def wait_for_db_connection(retries: int = 10, delay_seconds: float = 3) -> None:
    """Retry database connection to handle startup ordering in containers."""
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            logger.info("Database connection established.")
            return
        except OperationalError as exc:
            if attempt == retries:
                logger.exception("Database unavailable after %s attempts.", retries)
                raise
            logger.info(
                "Database not ready (attempt %s/%s): %s. Retrying in %.1fs.",
                attempt,
                retries,
                exc,
                delay_seconds,
            )
            await asyncio.sleep(delay_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await wait_for_db_connection()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        ensure_default_project(db)
    start_watcher()
    await start_scheduler()
    plugin_service.initialize()
    yield
    # Shutdown
    await stop_scheduler()
    stop_watcher()
    plugin_service.manager.stop_hot_reload()


settings = get_settings()

plugin_service = PluginService(None)  # type: ignore[arg-type]

app = FastAPI(
    title="dbt-Workbench API",
    version=settings.backend_version,
    lifespan=lifespan,
)

# Rebind plugin service now that the FastAPI app exists
plugin_service.app = app
plugin_service.manager.app = app
app.state.plugin_service = plugin_service

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(admin.router)
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
app.include_router(plugins.router)
app.include_router(git.router)
app.include_router(profiles.router)


@app.get("/config")
async def get_config():
    """Get application configuration."""
    return {
        "artifact_watcher": {
            "max_versions": settings.max_artifact_versions,
            "monitored_files": settings.monitored_artifact_files,
            "polling_interval": settings.artifact_polling_interval,
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
            "log_buffer_size": settings.log_buffer_size,
        },
        "catalog": {
            "allow_metadata_edits": settings.allow_metadata_edits,
            "search_indexing_frequency_seconds": settings.search_indexing_frequency_seconds,
            "freshness_threshold_override_minutes": settings.freshness_threshold_override_minutes,
            "validation_severity": settings.validation_severity,
            "statistics_refresh_policy": settings.statistics_refresh_policy,
        },
        "auth": {
            "enabled": settings.auth_enabled,
            "single_project_mode": settings.single_project_mode,
            "access_token_expire_minutes": settings.access_token_expire_minutes,
            "refresh_token_expire_minutes": settings.refresh_token_expire_minutes,
            "password_min_length": settings.password_min_length,
        },
        "workspaces": {
            "default_workspace_key": settings.default_workspace_key,
            "default_workspace_name": settings.default_workspace_name,
            "single_project_mode": settings.single_project_mode,
        },
    }


@app.get("/")
def root():
    return {"message": "dbt-Workbench API", "version": settings.backend_version}
