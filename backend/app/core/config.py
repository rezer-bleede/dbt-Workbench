from functools import lru_cache
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    backend_port: int = Field(8000, alias="BACKEND_PORT")
    dbt_artifacts_path: str = Field("./dbt_artifacts", alias="DBT_ARTIFACTS_PATH")
    backend_version: str = "0.1.0"
    
    # Live metadata update settings
    artifact_polling_interval: int = Field(5, alias="ARTIFACT_POLLING_INTERVAL")  # seconds
    max_artifact_versions: int = Field(10, alias="MAX_ARTIFACT_VERSIONS")
    monitored_artifact_files: List[str] = Field(
        default=["manifest.json", "run_results.json", "catalog.json"],
        alias="MONITORED_ARTIFACT_FILES"
    )
    
    # dbt execution settings
    dbt_project_path: str = Field("./dbt_project", alias="DBT_PROJECT_PATH")
    max_concurrent_runs: int = Field(1, alias="MAX_CONCURRENT_RUNS")
    max_run_history: int = Field(100, alias="MAX_RUN_HISTORY")
    max_artifact_sets: int = Field(50, alias="MAX_ARTIFACT_SETS")
    log_buffer_size: int = Field(1000, alias="LOG_BUFFER_SIZE")  # lines

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
