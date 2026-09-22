import React, { useEffect, useState } from 'react';
import {
  CatchUpPolicy,
  EnvironmentConfig,
  NotificationConfig,
  OverlapPolicy,
  Schedule,
  ScheduleSummary,
  ScheduleStatus,
  ScheduledRun,
  RunFinalResult,
  SchedulerOverview,
  NotificationTestResponse,
} from '../types';
import { SchedulerService } from '../services/schedulerService';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

type Mode = 'list' | 'detail' | 'create' | 'edit';

interface ScheduleFormState {
  name: string;
  description?: string;
  cron_expression: string;
  timezone: string;
  dbt_command: 'run' | 'test' | 'seed' | 'docs generate';
  environment_id: number | '';
  notification_config: NotificationConfig;
  retry_policy: {
    max_retries: number;
    delay_seconds: number;
    backoff_strategy: 'fixed' | 'exponential';
    max_delay_seconds?: number | null;
  };
  retention_policy?: {
    scope: 'per_schedule' | 'per_environment';
    keep_last_n_runs?: number | null;
    keep_for_n_days?: number | null;
    action: 'archive' | 'delete';
  } | null;
  catch_up_policy: CatchUpPolicy;
  overlap_policy: OverlapPolicy;
  enabled: boolean;
}

const defaultFormState: ScheduleFormState = {
  name: '',
  description: '',
  cron_expression: '0 * * * *',
  timezone: 'UTC',
  dbt_command: 'run',
  environment_id: '',
  notification_config: {},
  retry_policy: {
    max_retries: 0,
    delay_seconds: 60,
    backoff_strategy: 'fixed',
    max_delay_seconds: null,
  },
  retention_policy: null,
  catch_up_policy: 'skip',
  overlap_policy: 'no_overlap',
  enabled: true,
};

function resolveDebugLink(link: string): string {
  if (!link) {
    return '#';
  }

  // If the link is already absolute (e.g. https://..., http://..., mailto:...), return as‑is
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link)) {
    return link;
  }

  const base = (api.defaults.baseURL || '').replace(/\/+$/, '');
  if (!base) {
    return link;
  }

  const normalizedPath = link.startsWith('/') ? link : `/${link}`;
  return `${base}${normalizedPath}`;
}

function SchedulesPage() {
  const { user, isAuthEnabled } = useAuth();
  const isDeveloperOrAdmin = !isAuthEnabled || user?.role === 'developer' || user?.role === 'admin';

  const [mode, setMode] = useState<Mode>('list');
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [runs, setRuns] = useState<ScheduledRun[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([]);
  const [overview, setOverview] = useState<SchedulerOverview | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(defaultFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationResult, setNotificationResult] = useState<NotificationTestResponse | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  const loadData = async () => {
    try {
      const [scheduleList, envs, ov] = await Promise.all([
        SchedulerService.listSchedules(),
        SchedulerService.listEnvironments(),
        SchedulerService.getOverview().catch(() => null),
      ]);
      setSchedules(scheduleList);
      setEnvironments(envs);
      setOverview(ov);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectSchedule = async (id: number) => {
    try {
      const [schedule, runList] = await Promise.all([
        SchedulerService.getSchedule(id),
        SchedulerService.getScheduleRuns(id),
      ]);
      setSelectedSchedule(schedule);
      setRuns(runList.runs);
      setNotificationResult(null);
      setMode('detail');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    }
  };

  const handleCreateClick = () => {
    if (!isDeveloperOrAdmin) return;
    setForm(defaultFormState);
    setSelectedSchedule(null);
    setMode('create');
    setError(null);
  };

  const handleEditClick = () => {
    if (!isDeveloperOrAdmin || !selectedSchedule) return;
    setForm({
      name: selectedSchedule.name,
      description: selectedSchedule.description || '',
      cron_expression: selectedSchedule.cron_expression,
      timezone: selectedSchedule.timezone,
      dbt_command: selectedSchedule.dbt_command,
      environment_id: selectedSchedule.environment_id,
      notification_config: selectedSchedule.notification_config,
      retry_policy: selectedSchedule.retry_policy,
      retention_policy: selectedSchedule.retention_policy || null,
      catch_up_policy: selectedSchedule.catch_up_policy,
      overlap_policy: selectedSchedule.overlap_policy,
      enabled: selectedSchedule.enabled,
    });
    setMode('edit');
  };

  const handleFormChange = (field: keyof ScheduleFormState, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!isDeveloperOrAdmin) return;
    if (!form.environment_id) {
      setError('Environment is required');
      return;
    }
    setIsSaving(true);
    try {
      const payload: any = {
        ...form,
        environment_id: form.environment_id,
      };
      let schedule: Schedule;
      if (mode === 'create') {
        schedule = await SchedulerService.createSchedule(payload);
      } else if (mode == 'edit' && selectedSchedule) {
        schedule = await SchedulerService.updateSchedule(selectedSchedule.id, payload);
      } else {
        setIsSaving(false);
        return;
      }
      await loadData();
      await handleSelectSchedule(schedule.id);
      setMode('detail');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isDeveloperOrAdmin || !selectedSchedule) return;
    if (!window.confirm('Delete this schedule? This cannot be undone.')) {
      return;
    }
    try {
      await SchedulerService.deleteSchedule(selectedSchedule.id);
      setSelectedSchedule(null);
      setRuns([]);
      setMode('list');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    }
  };

  const handlePauseResume = async () => {
    if (!isDeveloperOrAdmin || !selectedSchedule) return;
    try {
      const updated =
        selectedSchedule.status === 'active'
          ? await SchedulerService.pauseSchedule(selectedSchedule.id)
          : await SchedulerService.resumeSchedule(selectedSchedule.id);
      setSelectedSchedule(updated);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    }
  };

  const handleRunNow = async () => {
    if (!isDeveloperOrAdmin || !selectedSchedule) return;
    try {
      const run = await SchedulerService.runScheduleNow(selectedSchedule.id);
      setRuns(prev => [run, ...prev]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start manual run');
    }
  };

  const handleTestNotifications = async () => {
    if (!isDeveloperOrAdmin || !selectedSchedule) return;
    try {
      const result = await SchedulerService.testScheduleNotifications(selectedSchedule.id);
      setNotificationResult(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to test notifications');
    }
  };

  const renderStatusBadge = (status: ScheduleStatus) => {
    const color =
      status === 'active'
        ? 'border border-status-success/35 bg-status-success/15 text-status-success'
        : 'border border-status-warning/35 bg-status-warning/15 text-status-warning';
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${color}`}>
        {status === 'active' ? 'Active' : 'Paused'}
      </span>
    );
  };

  const getRunFailureReason = (run: ScheduledRun) => {
    if (run.status !== 'failure') {
      return '—';
    }

    const attempts = [...run.attempts].sort((a, b) => b.attempt_number - a.attempt_number);
    const attemptWithMessage = attempts.find(attempt => attempt.error_message);

    if (attemptWithMessage?.error_message) {
      return attemptWithMessage.error_message;
    }

    if (attempts.length > 0) {
      return 'No error message was returned for this run.';
    }

    if (run.log_links && Object.keys(run.log_links).length > 0) {
      return 'Check the attached logs for diagnostic information.';
    }

    return 'No diagnostic information available.';
  };

  const getRunStatusForDisplay = (run: ScheduledRun) => {
    const finalStatuses: RunFinalResult[] = ['success', 'failure', 'cancelled', 'skipped'];

    if (!finalStatuses.includes(run.status)) {
      const latestAttempt = run.attempts.slice().sort((a, b) => a.attempt_number - b.attempt_number).at(-1);
      return latestAttempt?.status || run.status;
    }

    return run.status;
  };

  const labelClass = 'text-sm font-medium text-muted';
  const helperTextClass = 'mt-1 text-xs text-muted';
  const inputClass =
    'panel-input mt-1 block h-10 w-full rounded-xl px-3 text-sm';
  const textareaClass =
    'panel-input mt-1 block min-h-[96px] w-full rounded-xl px-3 py-2 text-sm';
  const sectionCardClass =
    'panel-gradient-subtle rounded-xl p-5 space-y-4';
  const envError = error === 'Environment is required';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Schedules</h1>
          <p className="text-sm text-muted">
            Configure automated dbt runs with cron schedules, retries, and notifications.
          </p>
        </div>
        {isDeveloperOrAdmin && (
          <button
            onClick={handleCreateClick}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-accent hover:bg-accent/90"
          >
            New Schedule
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-status-danger/35 bg-status-danger/15 p-4 text-sm text-status-danger">
          {error}
        </div>
      )}

      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="panel-gradient rounded-lg p-4">
            <div className="text-sm text-muted">Active Schedules</div>
            <div className="mt-1 text-2xl font-semibold text-text">
              {overview.active_schedules}
            </div>
          </div>
          <div className="panel-gradient rounded-lg p-4">
            <div className="text-sm text-muted">Total Scheduled Runs</div>
            <div className="mt-1 text-2xl font-semibold text-text">
              {overview.total_scheduled_runs}
            </div>
          </div>
          <div className="panel-gradient rounded-lg p-4">
            <div className="text-sm text-muted">Success / Failure</div>
            <div className="mt-1 text-2xl font-semibold text-text">
              {overview.total_successful_runs} / {overview.total_failed_runs}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Schedule list */}
        <div className="lg:col-span-1">
          <div className="panel-gradient rounded-lg">
            <div className="panel-divider flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-lg font-semibold text-text">All Schedules</h2>
            </div>
            <div className="divide-y divide-border">
              {schedules.map(schedule => (
                <button
                  key={schedule.id}
                  onClick={() => handleSelectSchedule(schedule.id)}
                  className="w-full px-4 py-3 text-left hover:bg-panel/60 focus:outline-none"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-text">
                        {schedule.name}
                      </div>
                      <div className="text-xs text-muted">
                        dbt {schedule.dbt_command} · Next:{' '}
                        {schedule.next_run_time
                          ? new Date(schedule.next_run_time).toLocaleString()
                          : 'n/a'}
                      </div>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      {renderStatusBadge(schedule.status)}
                    </div>
                  </div>
                </button>
              ))}
              {schedules.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted">
                  No schedules defined yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detail / form */}
        <div className="lg:col-span-2">
          {mode === 'list' && (
            <div className="panel-gradient rounded-lg p-6 text-sm text-muted">
              Select a schedule to view details, or create a new schedule.
            </div>
          )}

          {(mode === 'create' || mode === 'edit') && (
            <div className="mx-auto max-w-5xl">
              <div className="panel-gradient rounded-2xl">
                <div className="panel-divider space-y-1 border-b px-6 py-5">
                  <h2 className="text-xl font-semibold text-text">
                    {mode === 'create' ? 'Create schedule' : 'Edit schedule'}
                  </h2>
                  <p className="text-sm text-muted">
                    Configure a dbt command to run automatically.
                  </p>
                </div>

                <div className="space-y-6 px-6 py-6">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-6">
                      <div className={sectionCardClass}>
                        <div>
                          <h3 className="text-sm font-semibold text-text">
                            Basics
                          </h3>
                          <p className={helperTextClass}>
                            Core details for your schedule.
                          </p>
                        </div>
                        <div className="panel-divider space-y-4 border-t pt-4">
                          <div>
                            <label className={labelClass}>Name</label>
                            <input
                              type="text"
                              value={form.name}
                              onChange={e => handleFormChange('name', e.target.value)}
                              className={inputClass}
                              placeholder="Nightly warehouse refresh"
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Description</label>
                            <textarea
                              value={form.description}
                              onChange={e => handleFormChange('description', e.target.value)}
                              className={textareaClass}
                              rows={3}
                              placeholder="Optional context for teammates."
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Command</label>
                            <select
                              value={form.dbt_command}
                              onChange={e =>
                                handleFormChange(
                                  'dbt_command',
                                  e.target.value as ScheduleFormState['dbt_command'],
                                )
                              }
                              className={inputClass}
                            >
                              <option value="run">dbt run</option>
                              <option value="test">dbt test</option>
                              <option value="seed">dbt seed</option>
                              <option value="docs generate">dbt docs generate</option>
                            </select>
                            <p className={helperTextClass}>
                              Choose the dbt command to execute.
                            </p>
                          </div>
                          <div>
                            <label className={labelClass}>
                              Environment
                              <span className="ml-2 text-xs font-medium text-muted">
                                Required
                              </span>
                            </label>
                            <select
                              value={form.environment_id}
                              onChange={e =>
                                handleFormChange(
                                  'environment_id',
                                  e.target.value ? Number(e.target.value) : '',
                                )
                              }
                              className={`${inputClass} ${
                                envError
                                  ? 'border-rose-400/55'
                                  : ''
                              }`}
                              aria-invalid={envError}
                              aria-describedby={envError ? 'environment-error' : undefined}
                            >
                              <option value="">Select environment</option>
                              {environments.map(env => (
                                <option key={env.id} value={env.id}>
                                  {env.name}
                                </option>
                              ))}
                            </select>
                            {envError ? (
                              <p id="environment-error" className="mt-1 text-xs text-rose-300">
                                Environment is required.
                              </p>
                            ) : (
                              <p className={helperTextClass}>Pick where this schedule will run.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className={sectionCardClass}>
                        <div>
                          <h3 className="text-sm font-semibold text-text">
                            Schedule
                          </h3>
                          <p className={helperTextClass}>
                            Define when and where the job runs.
                          </p>
                        </div>
                        <div className="panel-divider space-y-4 border-t pt-4">
                          <div>
                            <label className={labelClass}>Cron expression</label>
                            <input
                              type="text"
                              value={form.cron_expression}
                              onChange={e => handleFormChange('cron_expression', e.target.value)}
                              className={`${inputClass} font-mono`}
                              placeholder="0 * * * *"
                            />
                            <p className={helperTextClass}>
                              Standard cron format. Example: <code>0 * * * *</code> for hourly.
                            </p>
                          </div>
                          <div>
                            <label className={labelClass}>Timezone</label>
                            <input
                              type="text"
                              value={form.timezone}
                              onChange={e => handleFormChange('timezone', e.target.value)}
                              className={inputClass}
                              placeholder="UTC"
                            />
                            <p className={helperTextClass}>Defaults to UTC.</p>
                          </div>
                        </div>
                      </div>

                      <div className={sectionCardClass}>
                        <div>
                          <h3 className="text-sm font-semibold text-text">
                            Retries &amp; behavior
                          </h3>
                          <p className={helperTextClass}>
                            Controls for reliability and concurrency.
                          </p>
                        </div>
                        <div className="panel-divider space-y-4 border-t pt-4">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <label className={labelClass}>Max retries</label>
                              <input
                                type="number"
                                min={0}
                                value={form.retry_policy.max_retries}
                                onChange={e =>
                                  setForm(prev => ({
                                    ...prev,
                                    retry_policy: {
                                      ...prev.retry_policy,
                                      max_retries: Number(e.target.value),
                                    },
                                  }))
                                }
                                className={inputClass}
                              />
                              <p className={helperTextClass}>Use 0 to disable retries.</p>
                            </div>
                            <div>
                              <label className={labelClass}>Retry delay (seconds)</label>
                              <input
                                type="number"
                                min={0}
                                value={form.retry_policy.delay_seconds}
                                onChange={e =>
                                  setForm(prev => ({
                                    ...prev,
                                    retry_policy: {
                                      ...prev.retry_policy,
                                      delay_seconds: Number(e.target.value),
                                    },
                                  }))
                                }
                                className={inputClass}
                              />
                              <p className={helperTextClass}>Waiting period between attempts.</p>
                            </div>
                          </div>
                          <div>
                            <label className={labelClass}>Backoff strategy</label>
                            <select
                              value={form.retry_policy.backoff_strategy}
                              onChange={e =>
                                setForm(prev => ({
                                  ...prev,
                                  retry_policy: {
                                    ...prev.retry_policy,
                                    backoff_strategy: e.target.value as 'fixed' | 'exponential',
                                  },
                                }))
                              }
                              className={inputClass}
                            >
                              <option value="fixed">Fixed</option>
                              <option value="exponential">Exponential</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <label className={labelClass}>Catch-up policy</label>
                              <select
                                value={form.catch_up_policy}
                                onChange={e =>
                                  handleFormChange(
                                    'catch_up_policy',
                                    e.target.value as CatchUpPolicy,
                                  )
                                }
                                className={inputClass}
                              >
                                <option value="skip">Skip missed</option>
                                <option value="catch_up">Catch up</option>
                              </select>
                            </div>
                            <div>
                              <label className={labelClass}>Overlap policy</label>
                              <select
                                value={form.overlap_policy}
                                onChange={e =>
                                  handleFormChange(
                                    'overlap_policy',
                                    e.target.value as OverlapPolicy,
                                  )
                                }
                                className={inputClass}
                              >
                                <option value="no_overlap">No overlap</option>
                                <option value="allow_overlap">Allow overlap</option>
                              </select>
                            </div>
                          </div>
                          <div className="panel-gradient-subtle rounded-xl p-3">
                            <label className="flex items-start gap-3 text-sm text-text">
                              <input
                                id="enabled"
                                type="checkbox"
                                checked={form.enabled}
                                onChange={e => handleFormChange('enabled', e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/50"
                              />
                              <span>
                                <span className="font-medium">Enabled</span>
                                <span className="mt-1 block text-xs text-muted">
                                  Run this schedule automatically when active.
                                </span>
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="panel-gradient-subtle panel-divider sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t px-6 py-4 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => {
                      setMode(selectedSchedule ? 'detail' : 'list');
                    }}
                    className="panel-gradient-subtle inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition hover:bg-panel/70 focus:outline-none focus:ring-2 focus:ring-ring/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === 'detail' && selectedSchedule && (
            <div className="space-y-4">
              <div className="panel-gradient rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-text">{selectedSchedule.name}</h2>
                    <p className="text-sm text-muted">
                      dbt {selectedSchedule.dbt_command} ·{' '}
                      {renderStatusBadge(selectedSchedule.status)}
                    </p>
                  </div>
                  {isDeveloperOrAdmin && (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleRunNow}
                        className="rounded-md border border-primary/30 bg-primary/15 px-3 py-1 text-sm text-text hover:bg-primary/20"
                      >
                        Run now
                      </button>
                      <button
                        onClick={handleTestNotifications}
                        className="panel-gradient-subtle rounded-md border border-border px-3 py-1 text-sm text-muted hover:bg-panel/70"
                      >
                        Test notifications
                      </button>
                      <button
                        onClick={handleEditClick}
                        className="panel-gradient-subtle rounded-md border border-border px-3 py-1 text-sm text-muted hover:bg-panel/70"
                      >
                        Edit
                      </button>
                      <button
                        onClick={handlePauseResume}
                        className="panel-gradient-subtle rounded-md border border-border px-3 py-1 text-sm text-muted hover:bg-panel/70"
                      >
                        {selectedSchedule.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={handleDelete}
                        className="px-3 py-1 text-sm rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="font-medium text-muted">Cron</dt>
                    <dd className="mt-1 font-mono text-text">
                      {selectedSchedule.cron_expression}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Timezone</dt>
                    <dd className="mt-1 text-text">{selectedSchedule.timezone}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Next Run</dt>
                    <dd className="mt-1 text-text">
                      {selectedSchedule.next_run_time
                        ? new Date(selectedSchedule.next_run_time).toLocaleString()
                        : 'n/a'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted">Last Run</dt>
                    <dd className="mt-1 text-text">
                      {selectedSchedule.last_run_time
                        ? new Date(selectedSchedule.last_run_time).toLocaleString()
                        : 'n/a'}
                    </dd>
                  </div>
                </dl>
              </div>

              {notificationResult && (
                <div className="panel-gradient rounded-lg p-4">
                  <h3 className="text-md font-semibold mb-2">Notification test results</h3>
                  <ul className="space-y-1 text-sm text-muted">
                    {notificationResult.results.map(result => (
                      <li key={result.channel}>
                        <span className="font-medium">{result.channel}</span>:{' '}
                        {result.success ? (
                          <span className="text-status-success font-semibold">success</span>
                        ) : (
                          <span className="text-status-danger font-semibold">
                            failed{result.error_message ? ` – ${result.error_message}` : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="panel-gradient rounded-lg">
                <div className="panel-divider flex items-center justify-between border-b px-6 py-4">
                  <h3 className="text-md font-semibold text-text">Historical Runs</h3>
                </div>
                <div className="panel-table overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted">
                          Run
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted">
                          Trigger
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted">
                          Attempts
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted">
                          Failure reason
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted">
                          Scheduled
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted">
                          Started
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted">
                          Finished
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {runs.map(run => (
                        <tr key={run.id}>
                          <td className="px-4 py-2 text-sm text-text">
                            {run.id}
                          </td>
                          <td className="px-4 py-2 text-sm text-text">
                            {run.triggering_event}
                          </td>
                          <td className="px-4 py-2 text-sm text-text">
                            <StatusBadge status={getRunStatusForDisplay(run)} />
                          </td>
                          <td className="px-4 py-2 text-sm text-text">
                            {run.attempts_total}
                          </td>
                          <td
                            className="max-w-xs truncate px-4 py-2 text-sm text-text"
                            title={getRunFailureReason(run)}
                          >
                            {getRunFailureReason(run)}
                          </td>
                          <td className="px-4 py-2 text-sm text-text">
                            {new Date(run.scheduled_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-text">
                            {run.started_at ? new Date(run.started_at).toLocaleString() : 'n/a'}
                          </td>
                          <td className="px-4 py-2 text-sm text-text">
                            {run.finished_at ? new Date(run.finished_at).toLocaleString() : 'n/a'}
                          </td>
                          <td className="px-4 py-2 text-sm text-text">
                            <button
                              className="text-text hover:underline"
                              onClick={() =>
                                setExpandedRunId(prev => (prev === run.id ? null : run.id))
                              }
                              aria-label={`View details for run ${run.id}`}
                            >
                              {expandedRunId === run.id ? 'Hide details' : 'View details'}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {runs.length === 0 && (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-4 py-6 text-center text-sm text-muted"
                          >
                            No runs found for this schedule.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {runs.map(
                    run =>
                      expandedRunId === run.id && (
                        <div key={`details-${run.id}`} className="panel-divider border-t px-6 py-4">
                          <div className="space-y-3 text-sm text-text">
                            <div className="font-semibold text-text">Attempts</div>
                            {run.attempts.length === 0 && (
                              <div className="text-muted">No attempts recorded for this run.</div>
                            )}
                            {run.attempts.length > 0 && (
                              <ul className="space-y-2">
                                {run.attempts
                                  .slice()
                                  .sort((a, b) => a.attempt_number - b.attempt_number)
                                  .map(attempt => (
                                    <li key={attempt.id} className="panel-gradient-subtle rounded-md p-3">
                                      <div className="flex items-center justify-between">
                                        <div className="font-medium">Attempt {attempt.attempt_number}</div>
                                        <StatusBadge status={attempt.status} />
                                      </div>
                                      <div className="mt-1 text-muted">
                                        {attempt.error_message || 'No error message provided.'}
                                      </div>
                                      <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-muted md:grid-cols-3">
                                        <div>
                                          <span className="font-semibold">Queued:</span>{' '}
                                          {attempt.queued_at
                                            ? new Date(attempt.queued_at).toLocaleString()
                                            : 'n/a'}
                                        </div>
                                        <div>
                                          <span className="font-semibold">Started:</span>{' '}
                                          {attempt.started_at
                                            ? new Date(attempt.started_at).toLocaleString()
                                            : 'n/a'}
                                        </div>
                                        <div>
                                          <span className="font-semibold">Finished:</span>{' '}
                                          {attempt.finished_at
                                            ? new Date(attempt.finished_at).toLocaleString()
                                            : 'n/a'}
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                              </ul>
                            )}

                            <div className="font-semibold text-text">Debug information</div>
                            {Object.keys(run.log_links || {}).length === 0 &&
                              Object.keys(run.artifact_links || {}).length === 0 && (
                                <div className="text-muted">No debug links were provided for this run.</div>
                              )}
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(run.log_links || {}).map(([label, link]) => (
                                <a
                                  key={`log-${label}`}
                                  href={resolveDebugLink(link)}
                                  className="text-text hover:underline"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View {label} log
                                </a>
                              ))}
                              {Object.entries(run.artifact_links || {}).map(([label, link]) => (
                                <a
                                  key={`artifact-${label}`}
                                  href={resolveDebugLink(link)}
                                  className="text-text hover:underline"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View {label}
                                </a>
                              ))}
                            </div>
                          </div>
                        </div>
                      ),
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SchedulesPage;
