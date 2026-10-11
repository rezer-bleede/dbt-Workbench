from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from ..connection import Base


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    artifacts_path = Column(String, nullable=False)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    is_active = Column(Boolean, default=True)

    environments = relationship("Environment", back_populates="workspace")
    user_links = relationship("UserWorkspace", back_populates="workspace")
    plugin_configs = relationship("PluginWorkspaceConfig", back_populates="workspace")


class PluginWorkspaceConfig(Base):
    __tablename__ = "plugin_workspace_configs"

    id = Column(Integer, primary_key=True, index=True)
    plugin_name = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    settings = Column(JSON, default=dict)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)

    workspace = relationship("Workspace", back_populates="plugin_configs")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # viewer, developer, admin
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

    workspaces = relationship("UserWorkspace", back_populates="user")


class UserWorkspace(Base):
    __tablename__ = "user_workspaces"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    is_default = Column(Boolean, default=False)

    user = relationship("User", back_populates="workspaces")
    workspace = relationship("Workspace", back_populates="user_links")


class UserTheme(Base):
    __tablename__ = "user_themes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    theme = Column(JSON, default=dict)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

    user = relationship("User")
    workspace = relationship("Workspace")


class GitRepository(Base):
    __tablename__ = "git_repositories"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    remote_url = Column(String, nullable=True)
    provider = Column(String, nullable=True)
    default_branch = Column(String, nullable=False, default="main")
    directory = Column(String, nullable=False)
    last_synced_at = Column(DateTime, nullable=True)

    workspace = relationship("Workspace")


class Model(Base):
    __tablename__ = "models"

    id = Column(Integer, primary_key=True, index=True)
    unique_id = Column(String, unique=True, index=True)
    name = Column(String)
    schema = Column(String)
    database = Column(String)
    resource_type = Column(String)
    columns = Column(JSON)
    tags = Column(JSON, default=list)
    checksum = Column(String)
    timestamp = Column(DateTime)
    run_id = Column(Integer, ForeignKey("runs.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)

    run = relationship("Run", back_populates="models")


class Run(Base):
    __tablename__ = "runs"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String, unique=True, index=True)
    command = Column(String)
    timestamp = Column(DateTime)
    status = Column(String)
    summary = Column(JSON)
    logs = Column(JSON, nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)

    models = relationship("Model", back_populates="run")
    tests = relationship("Test", back_populates="run")
    artifacts = relationship("Artifact", back_populates="run")


class Lineage(Base):
    __tablename__ = "lineage"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(String, ForeignKey("models.unique_id"))
    child_id = Column(String, ForeignKey("models.unique_id"))
    run_id = Column(Integer, ForeignKey("runs.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)


class ColumnLineage(Base):
    __tablename__ = "column_lineage"

    id = Column(Integer, primary_key=True, index=True)
    source_column = Column(String, index=True)
    target_column = Column(String, index=True)
    source_node = Column(String, ForeignKey("models.unique_id"))
    target_node = Column(String, ForeignKey("models.unique_id"))
    run_id = Column(Integer, ForeignKey("runs.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    model_ids = Column(JSON)
    status = Column(String)
    timestamp = Column(DateTime)
    run_id = Column(Integer, ForeignKey("runs.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)

    run = relationship("Run", back_populates="tests")


class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    checksum = Column(String)
    metadata_ = Column("metadata", JSON)
    run_id = Column(Integer, ForeignKey("runs.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)

    run = relationship("Run", back_populates="artifacts")


class Environment(Base):
    __tablename__ = "environments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    dbt_target_name = Column(String, nullable=True)
    connection_profile_reference = Column(String, nullable=True)
    variables = Column(JSON, default=dict)
    default_retention_policy = Column(JSON, nullable=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)

    workspace = relationship("Workspace", back_populates="environments")
    schedules = relationship("Schedule", back_populates="environment")
    sql_queries = relationship("SqlQuery", back_populates="environment")


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    cron_expression = Column(String, nullable=False)
    timezone = Column(String, nullable=False)
    dbt_command = Column(String, nullable=False)
    custom_command = Column(String, nullable=True)
    environment_id = Column(Integer, ForeignKey("environments.id"), nullable=False)
    notification_config = Column(JSON, default=dict)
    retry_policy = Column(JSON, default=dict)
    retention_policy = Column(JSON, nullable=True)
    catch_up_policy = Column(String, default="skip")
    overlap_policy = Column(String, default="no_overlap")
    enabled = Column(Boolean, default=True)
    status = Column(String, default="active")
    next_run_time = Column(DateTime)
    last_run_time = Column(DateTime)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    environment = relationship("Environment", back_populates="schedules")
    runs = relationship("ScheduledRun", back_populates="schedule", cascade="all, delete-orphan")


class ScheduledRun(Base):
    __tablename__ = "scheduled_runs"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=False)
    triggering_event = Column(String, nullable=False)
    status = Column(String, nullable=False)
    retry_status = Column(String, nullable=False)
    attempts_total = Column(Integer, default=0)
    scheduled_at = Column(DateTime, nullable=False)
    queued_at = Column(DateTime)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    environment_snapshot = Column(JSON, default=dict)
    command = Column(JSON, default=dict)
    log_links = Column(JSON, default=dict)
    artifact_links = Column(JSON, default=dict)

    schedule = relationship("Schedule", back_populates="runs")
    attempts = relationship(
        "ScheduledRunAttempt",
        back_populates="scheduled_run",
        cascade="all, delete-orphan",
    )
    notification_events = relationship(
        "NotificationEvent",
        back_populates="scheduled_run",
        cascade="all, delete-orphan",
    )
    scheduler_events = relationship(
        "SchedulerEvent",
        back_populates="scheduled_run",
        cascade="all, delete-orphan",
    )


class ScheduledRunAttempt(Base):
    __tablename__ = "scheduled_run_attempts"

    id = Column(Integer, primary_key=True, index=True)
    scheduled_run_id = Column(
        Integer,
        ForeignKey("scheduled_runs.id"),
        nullable=False,
    )
    attempt_number = Column(Integer, nullable=False)
    run_id = Column(String, index=True, nullable=True)
    db_run_id = Column(Integer, ForeignKey("runs.id"), nullable=True)
    status = Column(String, nullable=False)
    queued_at = Column(DateTime)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    error_message = Column(String, nullable=True)

    scheduled_run = relationship("ScheduledRun", back_populates="attempts")
    db_run = relationship("Run")


class SchedulerEvent(Base):
    __tablename__ = "scheduler_events"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=True)
    scheduled_run_id = Column(Integer, ForeignKey("scheduled_runs.id"), nullable=True)
    level = Column(String, default="INFO")
    event_type = Column(String, nullable=False)
    message = Column(String, nullable=False)
    details = Column(JSON, default=dict)
    timestamp = Column(DateTime)

    schedule = relationship("Schedule")
    scheduled_run = relationship("ScheduledRun", back_populates="scheduler_events")


class NotificationEvent(Base):
    __tablename__ = "notification_events"

    id = Column(Integer, primary_key=True, index=True)
    scheduled_run_id = Column(Integer, ForeignKey("scheduled_runs.id"), nullable=False)
    channel = Column(String, nullable=False)
    trigger = Column(String, nullable=False)
    status = Column(String, nullable=False)
    error_message = Column(String, nullable=True)
    payload = Column(JSON, default=dict)
    created_at = Column(DateTime)

    scheduled_run = relationship("ScheduledRun", back_populates="notification_events")


class CatalogMetadata(Base):
    __tablename__ = "catalog_metadata"

    id = Column(Integer, primary_key=True, index=True)
    unique_id = Column(String, index=True, nullable=False)
    entity_type = Column(String, nullable=False)
    owner = Column(String, nullable=True)
    description_override = Column(String, nullable=True)
    tags_override = Column(JSON, default=list)
    custom_metadata = Column(JSON, default=dict)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)


class ColumnMetadata(Base):
    __tablename__ = "column_metadata"

    id = Column(Integer, primary_key=True, index=True)
    unique_id = Column(String, index=True, nullable=False)
    column_name = Column(String, nullable=False)
    description_override = Column(String, nullable=True)
    owner = Column(String, nullable=True)
    tags_override = Column(JSON, default=list)
    custom_metadata = Column(JSON, default=dict)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)


class ColumnStatistic(Base):
    __tablename__ = "column_statistics"

    id = Column(Integer, primary_key=True, index=True)
    unique_id = Column(String, index=True, nullable=False)
    column_name = Column(String, nullable=False)
    null_count = Column(Float, nullable=True)
    distinct_count = Column(Float, nullable=True)
    min_value = Column(String, nullable=True)
    max_value = Column(String, nullable=True)
    distribution = Column(JSON, default=dict)
    updated_at = Column(DateTime, nullable=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)


class SqlQuery(Base):
    __tablename__ = "sql_queries"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    environment_id = Column(Integer, ForeignKey("environments.id"), nullable=True)
    query_text = Column(String)
    status = Column(String)
    error_message = Column(String, nullable=True)
    execution_time_ms = Column(Integer, nullable=True)
    row_count = Column(Integer, nullable=True)
    truncated = Column(Boolean, default=False)
    model_ref = Column(String, nullable=True)
    compiled_sql = Column(String, nullable=True)
    compiled_sql_checksum = Column(String, nullable=True)
    source_sql = Column(String, nullable=True)
    execution_mode = Column(String, default="sql")

    environment = relationship("Environment", back_populates="sql_queries")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String, nullable=True)
    action = Column(String, nullable=False)
    resource = Column(String, nullable=False)
    metadata_ = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime)
    commit_hash = Column(String, nullable=True)
    environment = Column(String, nullable=True)

    workspace = relationship("Workspace")
    user = relationship("User")


class AiWorkspaceSetting(Base):
    __tablename__ = "ai_workspace_settings"
    __table_args__ = (UniqueConstraint("workspace_id", name="uq_ai_workspace_settings_workspace_id"),)

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    enabled = Column(Boolean, default=True)
    default_mode = Column(String, default="direct")  # direct | mcp
    default_direct_provider = Column(String, default="openai")
    default_model_openai = Column(String, nullable=True)
    default_model_anthropic = Column(String, nullable=True)
    default_model_gemini = Column(String, nullable=True)
    allow_session_provider_override = Column(Boolean, default=True)
    allow_data_context_results = Column(Boolean, default=True)
    allow_data_context_run_logs = Column(Boolean, default=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

    workspace = relationship("Workspace")


class AiWorkspaceSecret(Base):
    __tablename__ = "ai_workspace_secrets"
    __table_args__ = (
        UniqueConstraint("workspace_id", "secret_key", name="uq_ai_workspace_secret_workspace_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    secret_key = Column(String, nullable=False)
    encrypted_value = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

    workspace = relationship("Workspace")


class AiMcpServer(Base):
    __tablename__ = "ai_mcp_servers"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_ai_mcp_server_workspace_name"),
        Index("ix_ai_mcp_servers_workspace_enabled", "workspace_id", "enabled"),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    mode = Column(String, nullable=False)  # remote_http | remote_sse | local_stdio
    enabled = Column(Boolean, default=True)
    config = Column(JSON, default=dict)
    secret_refs = Column(JSON, default=list)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

    workspace = relationship("Workspace")


class AiConversation(Base):
    __tablename__ = "ai_conversations"
    __table_args__ = (Index("ix_ai_conversations_workspace_created", "workspace_id", "created_at"),)

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String, nullable=False, default="New conversation")
    meta = Column(JSON, default=dict)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)

    workspace = relationship("Workspace")
    user = relationship("User")


class AiMessage(Base):
    __tablename__ = "ai_messages"
    __table_args__ = (Index("ix_ai_messages_conversation_created", "conversation_id", "created_at"),)

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    role = Column(String, nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    provider_mode = Column(String, nullable=True)
    provider_name = Column(String, nullable=True)
    model_name = Column(String, nullable=True)
    message_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime)

    workspace = relationship("Workspace")
    conversation = relationship("AiConversation")
    user = relationship("User")


class AiToolTrace(Base):
    __tablename__ = "ai_tool_traces"
    __table_args__ = (Index("ix_ai_tool_traces_workspace_created", "workspace_id", "created_at"),)

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("ai_messages.id"), nullable=True, index=True)
    tool_name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="ok")
    input_payload = Column(JSON, default=dict)
    output_payload = Column(JSON, default=dict)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime)

    workspace = relationship("Workspace")
    conversation = relationship("AiConversation")
    message = relationship("AiMessage")


class AiActionProposal(Base):
    __tablename__ = "ai_action_proposals"
    __table_args__ = (Index("ix_ai_action_workspace_status_created", "workspace_id", "status", "created_at"),)

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(String, unique=True, index=True, nullable=False)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("ai_messages.id"), nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    proposal_type = Column(String, nullable=False)  # sql_execute | dbt_run
    status = Column(String, nullable=False, default="pending")  # pending | confirmed | rejected | expired | executed
    payload = Column(JSON, default=dict)
    risk_flags = Column(JSON, default=list)
    result_payload = Column(JSON, default=dict)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    confirmed_at = Column(DateTime, nullable=True)
    confirmed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    workspace = relationship("Workspace")
    conversation = relationship("AiConversation")
    message = relationship("AiMessage")
