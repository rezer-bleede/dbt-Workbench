from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    backend_port: int = Field(8000, alias="BACKEND_PORT")
    dbt_artifacts_path: str = Field("./dbt_artifacts", alias="DBT_ARTIFACTS_PATH")
    backend_version: str = "0.1.0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
