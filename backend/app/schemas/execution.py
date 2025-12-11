from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DbtCommand(str, Enum):
    RUN = "run"
    TEST = "test"
    SEED = "seed"
    DOCS_GENERATE = "docs generate"


class RunRequest(BaseModel):
    command: DbtCommand
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict)
    description: Optional[str] = None


class RunSummary(BaseModel):
    run_id: str
    command: DbtCommand
    status: RunStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    description: Optional[str] = None
    error_message: Optional[str] = None
    artifacts_available: bool = False


class RunDetail(RunSummary):
    parameters: Dict[str, Any]
    log_lines: List[str] = Field(default_factory=list)
    artifacts_path: Optional[str] = None
    dbt_output: Optional[Dict[str, Any]] = None


class LogMessage(BaseModel):
    run_id: str
    timestamp: datetime
    level: str
    message: str
    line_number: int


class RunHistoryResponse(BaseModel):
    runs: List[RunSummary]
    total_count: int
    page: int
    page_size: int


class ArtifactInfo(BaseModel):
    filename: str
    size_bytes: int
    last_modified: datetime
    checksum: str


class RunArtifactsResponse(BaseModel):
    run_id: str
    artifacts: List[ArtifactInfo]
    artifacts_path: str