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

    database_url_override: str | None = Field(None, alias="DATABASE_URL")

    @computed_field
    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override
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

    # Catalog settings
    allow_metadata_edits: bool = Field(True, alias="ALLOW_METADATA_EDITS")
    search_indexing_frequency_seconds: int = Field(30, alias="SEARCH_INDEXING_FREQUENCY_SECONDS")
    freshness_threshold_override_minutes: int | None = Field(
        None, alias="FRESHNESS_THRESHOLD_OVERRIDE_MINUTES"
    )
    validation_severity: str = Field("warning", alias="VALIDATION_SEVERITY")
    statistics_refresh_policy: str = Field("on_artifact_change", alias="STATISTICS_REFRESH_POLICY")

    # Scheduler settings
    scheduler_enabled: bool = Field(True, alias="SCHEDULER_ENABLED")
    scheduler_poll_interval_seconds: int = Field(30, alias="SCHEDULER_POLL_INTERVAL_SECONDS")
    scheduler_max_catchup_runs: int = Field(10, alias="SCHEDULER_MAX_CATCHUP_RUNS")
    scheduler_default_timezone: str = Field("UTC", alias="SCHEDULER_DEFAULT_TIMEZONE")

    # SQL workspace settings
    sql_workspace_default_connection_url: str | None = Field(
        default=None,
        alias="SQL_WORKSPACE_DEFAULT_CONNECTION_URL",
    )
    sql_workspace_max_rows: int = Field(5000, alias="SQL_WORKSPACE_MAX_ROWS")
    sql_workspace_timeout_seconds: int = Field(60, alias="SQL_WORKSPACE_TIMEOUT_SECONDS")
    sql_workspace_allow_destructive_default: bool = Field(
        False,
        alias="SQL_WORKSPACE_ALLOW_DESTRUCTIVE_DEFAULT",
    )

    # Notification settings
    notifications_slack_timeout_seconds: int = Field(10, alias="NOTIFICATIONS_SLACK_TIMEOUT_SECONDS")
    notifications_webhook_timeout_seconds: int = Field(10, alias="NOTIFICATIONS_WEBHOOK_TIMEOUT_SECONDS")
    notifications_email_from: str = Field("dbt-workbench@example.com", alias="NOTIFICATIONS_EMAIL_FROM")
    notifications_email_smtp_host: str = Field("localhost", alias="NOTIFICATIONS_EMAIL_SMTP_HOST")
    notifications_email_smtp_port: int = Field(25, alias="NOTIFICATIONS_EMAIL_SMTP_PORT")
    notifications_email_use_tls: bool = Field(False, alias="NOTIFICATIONS_EMAIL_USE_TLS")
    notifications_email_username: str = Field("", alias="NOTIFICATIONS_EMAIL_USERNAME")
    notifications_email_password: str = Field("", alias="NOTIFICATIONS_EMAIL_PASSWORD")


@lru_cache
def get_settings() -> Settings:
    return Settings()
