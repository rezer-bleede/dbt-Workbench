export interface HealthResponse {
  status: string
  backend: string
  version: string
}

export interface Run {
  id: number;
  run_id: string;
  command: string;
  timestamp: string;
  status: string;
  summary: any;
}

export interface Model {
  id: number;
  unique_id: string;
  name: string;
  schema_: string;
  database: string;
  resource_type: string;
  columns: any;
  checksum: string;
  timestamp: string;
  run_id: number;
}

export interface ModelDiff {
  structural_diff: {
    added: any[];
    removed: any[];
    changed: any[];
  };
  metadata_diff: {
    description: { from: string; to: string };
    tags: { from: string[]; to: string[] };
    tests: { from: any[]; to: any[] };
  };
  checksum_diff: {
    from: string;
    to: string;
  };
}

export interface ArtifactSummary {
  manifest: boolean
  run_results: boolean
  catalog: boolean
}

export interface ModelSummary {
  unique_id: string
  name: string
  resource_type: string
  depends_on: string[]
  database?: string
  schema?: string
  alias?: string
  tags?: string[]
}

export interface ModelDetail extends ModelSummary {
  description?: string
  columns: Record<string, { name?: string; description?: string; type?: string }>
  children: string[]
  tags?: string[]
}

export interface LineageNode {
  id: string
  label: string
  type: string
  database?: string
  schema?: string
  tags?: string[]
}

export interface LineageEdge {
  source: string
  target: string
}

export interface LineageGraph {
  nodes: LineageNode[]
  edges: LineageEdge[]
  groups?: LineageGroup[]
}

export interface LineageGroup {
  id: string
  label: string
  type: string
  members: string[]
}

export interface ColumnNode {
  id: string
  column: string
  model_id: string
  label: string
  type: string
  database?: string
  schema?: string
  tags?: string[]
  data_type?: string
  description?: string
}

export interface ColumnLineageEdge extends LineageEdge {
  source_column: string
  target_column: string
}

export interface ColumnLineageGraph {
  nodes: ColumnNode[]
  edges: ColumnLineageEdge[]
}

export interface ImpactResponse {
  upstream: string[]
  downstream: string[]
}

export interface RunRecord {
  status?: string
  start_time?: string
  end_time?: string
  duration?: number
  invocation_id?: string
  model_unique_id?: string
}

export interface ArtifactVersionInfo {
  current_version: number
  timestamp: string | null
  checksum: string | null
  available_versions: number[]
  status: {
    healthy: boolean
    last_error: string | null
    last_check: string | null
  }
}

export interface VersionCheckResponse {
  updates_available: Record<string, boolean>
  any_updates: boolean
  current_versions: Record<string, number>
  version_info: Record<string, ArtifactVersionInfo>
}

// Execution types
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type DbtCommand = 'run' | 'test' | 'seed' | 'docs generate';

export interface RunRequest {
  command: DbtCommand;
  parameters?: Record<string, any>;
  description?: string;
}

export interface RunSummary {
  run_id: string;
  command: DbtCommand;
  status: RunStatus;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  description?: string;
  error_message?: string;
  artifacts_available: boolean;
}

export interface RunDetail extends RunSummary {
  parameters: Record<string, any>;
  log_lines: string[];
  artifacts_path?: string;
  dbt_output?: Record<string, any>;
}

export interface LogMessage {
  run_id: string;
  timestamp: string;
  level: string;
  message: string;
  line_number: number;
}

export interface RunHistoryResponse {
  runs: RunSummary[];
  total_count: number;
  page: number;
  page_size: number;
}

export interface ArtifactInfo {
  filename: string;
  size_bytes: number;
  last_modified: string;
  checksum: string;
}

export interface RunArtifactsResponse {
  run_id: string;
  artifacts: ArtifactInfo[];
  artifacts_path: string;
}

export type NotificationTrigger =
  | 'run_started'
  | 'run_succeeded'
  | 'run_failed'
  | 'run_cancelled';

export type NotificationChannelType = 'slack' | 'email' | 'webhook';

export type BackoffStrategy = 'fixed' | 'exponential';

export type CatchUpPolicy = 'skip' | 'catch_up';

export type OverlapPolicy = 'no_overlap' | 'allow_overlap';

export type ScheduleStatus = 'active' | 'paused';

export type RunFinalResult = 'success' | 'failure' | 'cancelled' | 'skipped';

export type RetryStatus = 'not_applicable' | 'in_progress' | 'exhausted';

export interface SlackNotificationConfig {
  webhook_url: string;
  triggers: NotificationTrigger[];
  enabled: boolean;
}

export interface EmailNotificationConfig {
  recipients: string[];
  triggers: NotificationTrigger[];
  enabled: boolean;
}

export interface WebhookNotificationConfig {
  endpoint_url: string;
  headers: Record<string, string>;
  triggers: NotificationTrigger[];
  enabled: boolean;
}

export interface NotificationConfig {
  slack?: SlackNotificationConfig;
  email?: EmailNotificationConfig;
  webhook?: WebhookNotificationConfig;
}

export interface RetryPolicy {
  max_retries: number;
  delay_seconds: number;
  backoff_strategy: BackoffStrategy;
  max_delay_seconds?: number | null;
}

export type RetentionScope = 'per_schedule' | 'per_environment';

export type RetentionAction = 'archive' | 'delete';

export interface RetentionPolicy {
  scope: RetentionScope;
  keep_last_n_runs?: number | null;
  keep_for_n_days?: number | null;
  action: RetentionAction;
}

export interface EnvironmentConfig {
  id: number;
  name: string;
  description?: string | null;
  dbt_target_name?: string | null;
  connection_profile_reference?: string | null;
  variables: Record<string, any>;
  default_retention_policy?: RetentionPolicy | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSummary {
  id: number;
  name: string;
  description?: string | null;
  environment_id: number;
  dbt_command: DbtCommand;
  status: ScheduleStatus;
  next_run_time?: string | null;
  last_run_time?: string | null;
  enabled: boolean;
}

export interface Schedule extends ScheduleSummary {
  cron_expression: string;
  timezone: string;
  notification_config: NotificationConfig;
  retry_policy: RetryPolicy;
  retention_policy?: RetentionPolicy | null;
  catch_up_policy: CatchUpPolicy;
  overlap_policy: OverlapPolicy;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export type TriggeringEvent = 'cron' | 'manual';

export interface ScheduledRunAttempt {
  id: number;
  attempt_number: number;
  run_id?: string | null;
  status: RunStatus;
  queued_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
}

export interface ScheduledRun {
  id: number;
  schedule_id: number;
  triggering_event: TriggeringEvent;
  status: RunFinalResult;
  retry_status: RetryStatus;
  attempts_total: number;
  scheduled_at: string;
  queued_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  environment_snapshot: Record<string, any>;
  command: Record<string, any>;
  log_links: Record<string, string>;
  artifact_links: Record<string, string>;
  attempts: ScheduledRunAttempt[];
}

export interface ScheduledRunListResponse {
  schedule_id: number;
  runs: ScheduledRun[];
}

export interface SchedulerOverview {
  active_schedules: number;
  paused_schedules: number;
  next_run_times: Record<number, string | null>;
  total_scheduled_runs: number;
  total_successful_runs: number;
  total_failed_runs: number;
}

export interface ScheduleMetrics {
  schedule_id: number;
  total_runs: number;
  success_count: number;
  failure_count: number;
  cancelled_count: number;
  skipped_count: number;
  retry_exhausted_count: number;
  last_run_status?: RunFinalResult | null;
  last_run_time?: string | null;
}

export interface NotificationTestChannelResult {
  channel: NotificationChannelType;
  success: boolean;
  error_message?: string | null;
}

export interface NotificationTestResponse {
  results: NotificationTestChannelResult[];
}

export type ScheduleCreate = Omit<
  Schedule,
  | 'id'
  | 'status'
  | 'next_run_time'
  | 'last_run_time'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
  | 'updated_by'
>;

export type ScheduleUpdate = Partial<ScheduleCreate> & {
  updated_by?: string | null;
};
