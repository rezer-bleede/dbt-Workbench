from functools import lru_cache
from typing import List
from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
        extra="ignore",
    )

    postgres_user: str = Field("user", alias="POSTGRES_USER")
    postgres_password: str = Field("password", alias="POSTGRES_PASSWORD")
    postgres_host: str = Field("localhost", alias="POSTGRES_HOST")
    postgres_port: int = Field(5432, alias="POSTGRES_PORT")
    postgres_db: str = Field("dbt_workbench", alias="POSTGRES_DB")

    @computed_field
    @property
    def database_url(self) -> str:
        return (
            f"postgresql://"
            f"{self.postgres_user}:{self.postgres_password}@"
            f"{self.postgres_host}:{self.postgres_port}/"
            f"{self.postgres_db}"
        )

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

    # Lineage configuration
    default_grouping_mode: str = Field("none", alias="DEFAULT_GROUPING_MODE")
    max_initial_lineage_depth: int = Field(4, alias="MAX_INITIAL_LINEAGE_DEPTH")
    load_column_lineage_by_default: bool = Field(False, alias="LOAD_COLUMN_LINEAGE_BY_DEFAULT")
    lineage_performance_mode: str = Field("balanced", alias="LINEAGE_PERFORMANCE_MODE")
    
    # dbt execution settings
    dbt_project_path: str = Field("./dbt_project", alias="DBT_PROJECT_PATH")
    max_concurrent_runs: int = Field(1, alias="MAX_CONCURRENT_RUNS")
    max_run_history: int = Field(100, alias="MAX_RUN_HISTORY")
    max_artifact_sets: int = Field(50, alias="MAX_ARTIFACT_SETS")
    log_buffer_size: int = Field(1000, alias="LOG_BUFFER_SIZE")  # lines


@lru_cache
def get_settings() -> Settings:
    return Settings()
