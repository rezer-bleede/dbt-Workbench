from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.schemas.execution import DbtCommand, RunStatus


class NotificationTrigger(str, Enum):
    RUN_STARTED = "run_started"
    RUN_SUCCEEDED = "run_succeeded"
    RUN_FAILED = "run_failed"
    RUN_CANCELLED = "run_cancelled"


class NotificationChannelType(str, Enum):
    SLACK = "slack"
    EMAIL = "email"
    WEBHOOK = "webhook"


class BackoffStrategy(str, Enum):
    FIXED = "fixed"
    EXPONENTIAL = "exponential"


class CatchUpPolicy(str, Enum):
    SKIP = "skip"
    CATCH_UP = "catch_up"


class OverlapPolicy(str, Enum):
    NO_OVERLAP = "no_overlap"
    ALLOW_OVERLAP = "allow_overlap"


class RetentionScope(str, Enum):
    PER_SCHEDULE = "per_schedule"
    PER_ENVIRONMENT = "per_environment"


class RetentionAction(str, Enum):
    ARCHIVE = "archive"
    DELETE = "delete"


class ScheduleStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"


class RunFinalResult(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class RetryStatus(str, Enum):
    NOT_APPLICABLE = "not_applicable"
    IN_PROGRESS = "in_progress"
    EXHAUSTED = "exhausted"


class TriggeringEvent(str, Enum):
    CRON = "cron"
    MANUAL = "manual"


class SlackNotificationConfig(BaseModel):
    webhook_url: str
    triggers: List[NotificationTrigger] = Field(default_factory=list)
    enabled: bool = True


class EmailNotificationConfig(BaseModel):
    recipients: List[str] = Field(default_factory=list)
    triggers: List[NotificationTrigger] = Field(default_factory=list)
    enabled: bool = True


class WebhookNotificationConfig(BaseModel):
    endpoint_url: str
    headers: Dict[str, str] = Field(default_factory=dict)
    triggers: List[NotificationTrigger] = Field(default_factory=list)
    enabled: bool = True


class NotificationConfig(BaseModel):
    slack: Optional[SlackNotificationConfig] = None
    email: Optional[EmailNotificationConfig] = None
    webhook: Optional[WebhookNotificationConfig] = None


class RetryPolicy(BaseModel):
    max_retries: int = 0
    delay_seconds: int = 60
    backoff_strategy: BackoffStrategy = BackoffStrategy.FIXED
    max_delay_seconds: Optional[int] = None


class RetentionPolicy(BaseModel):
    scope: RetentionScope = RetentionScope.PER_SCHEDULE
    keep_last_n_runs: Optional[int] = None
    keep_for_n_days: Optional[int] = None
    action: RetentionAction = RetentionAction.ARCHIVE


class EnvironmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    dbt_target_name: Optional[str] = None
    connection_profile_reference: Optional[str] = None
    variables: Dict[str, Any] = Field(default_factory=dict)
    default_retention_policy: Optional[RetentionPolicy] = None


class EnvironmentCreate(EnvironmentBase):
    pass


class EnvironmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    dbt_target_name: Optional[str] = None
    connection_profile_reference: Optional[str] = None
    variables: Optional[Dict[str, Any]] = None
    default_retention_policy: Optional[RetentionPolicy] = None


class Environment(EnvironmentBase):
    id: int
    created_at: datetime
    updated_at: datetime


class ScheduleBase(BaseModel):
    name: str
    description: Optional[str] = None
    cron_expression: str
    timezone: str
    dbt_command: DbtCommand
    environment_id: int
    notification_config: NotificationConfig = Field(default_factory=NotificationConfig)
    retry_policy: RetryPolicy = Field(default_factory=RetryPolicy)
    retention_policy: Optional[RetentionPolicy] = None
    catch_up_policy: CatchUpPolicy = CatchUpPolicy.SKIP
    overlap_policy: OverlapPolicy = OverlapPolicy.NO_OVERLAP
    enabled: bool = True


class ScheduleCreate(ScheduleBase):
    created_by: Optional[str] = None


class ScheduleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    dbt_command: Optional[DbtCommand] = None
    environment_id: Optional[int] = None
    notification_config: Optional[NotificationConfig] = None
    retry_policy: Optional[RetryPolicy] = None
    retention_policy: Optional[RetentionPolicy] = None
    catch_up_policy: Optional[CatchUpPolicy] = None
    overlap_policy: Optional[OverlapPolicy] = None
    enabled: Optional[bool] = None
    updated_by: Optional[str] = None


class ScheduleSummary(BaseModel):
    id: int
    name: str
    description: Optional[str]
    environment_id: int
    dbt_command: DbtCommand
    status: ScheduleStatus
    next_run_time: Optional[datetime] = None
    last_run_time: Optional[datetime] = None
    enabled: bool


class Schedule(ScheduleBase):
    id: int
    status: ScheduleStatus
    next_run_time: Optional[datetime] = None
    last_run_time: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


class ScheduledRunAttempt(BaseModel):
    id: int
    attempt_number: int
    run_id: Optional[str] = None
    status: RunStatus
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error_message: Optional[str] = None


class ScheduledRun(BaseModel):
    id: int
    schedule_id: int
    triggering_event: TriggeringEvent
    status: RunFinalResult
    retry_status: RetryStatus
    attempts_total: int
    scheduled_at: datetime
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    environment_snapshot: Dict[str, Any]
    command: Dict[str, Any]
    log_links: Dict[str, str] = Field(default_factory=dict)
    artifact_links: Dict[str, str] = Field(default_factory=dict)
    attempts: List[ScheduledRunAttempt] = Field(default_factory=list)


class ScheduledRunListResponse(BaseModel):
    schedule_id: int
    runs: List[ScheduledRun]


class NotificationRecord(BaseModel):
    id: int
    scheduled_run_id: int
    channel: NotificationChannelType
    trigger: NotificationTrigger
    status: str
    error_message: Optional[str] = None
    payload: Dict[str, Any]
    created_at: datetime


class SchedulerLogEntry(BaseModel):
    id: int
    schedule_id: Optional[int] = None
    scheduled_run_id: Optional[int] = None
    level: str
    event_type: str
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime


class ScheduleMetrics(BaseModel):
    schedule_id: int
    total_runs: int
    success_count: int
    failure_count: int
    cancelled_count: int
    skipped_count: int
    retry_exhausted_count: int
    last_run_status: Optional[RunFinalResult] = None
    last_run_time: Optional[datetime] = None


class SchedulerOverview(BaseModel):
    active_schedules: int
    paused_schedules: int
    next_run_times: Dict[int, Optional[datetime]]
    total_scheduled_runs: int
    total_successful_runs: int
    total_failed_runs: int


class NotificationTestRequest(BaseModel):
    schedule_id: Optional[int] = None
    notification_config: Optional[NotificationConfig] = None


class NotificationTestChannelResult(BaseModel):
    channel: NotificationChannelType
    success: bool
    error_message: Optional[str] = None


class NotificationTestResponse(BaseModel):
    results: List[NotificationTestChannelResult]