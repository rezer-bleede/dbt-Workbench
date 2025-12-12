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
  SchedulerOverview,
  NotificationTestResponse,
} from '../types';
import { SchedulerService } from '../services/schedulerService';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

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
        ? 'bg-green-100 text-green-800'
        : 'bg-yellow-100 text-yellow-800';
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${color}`}>
        {status === 'active' ? 'Active' : 'Paused'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedules</h1>
          <p className="text-sm text-gray-500">
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
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Active Schedules</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {overview.active_schedules}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Total Scheduled Runs</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {overview.total_scheduled_runs}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Success / Failure</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {overview.total_successful_runs} / {overview.total_failed_runs}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Schedule list */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">All Schedules</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {schedules.map(schedule => (
                <button
                  key={schedule.id}
                  onClick={() => handleSelectSchedule(schedule.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:outline-none"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {schedule.name}
                      </div>
                      <div className="text-xs text-gray-500">
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
                <div className="px-4 py-6 text-center text-sm text-gray-500">
                  No schedules defined yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detail / form */}
        <div className="lg:col-span-2">
          {mode === 'list' && (
            <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-500">
              Select a schedule to view details, or create a new schedule.
            </div>
          )}

          {(mode === 'create' || mode === 'edit') && (
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-semibold">
                {mode === 'create' ? 'Create Schedule' : 'Edit Schedule'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => handleFormChange('name', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Command
                  </label>
                  <select
                    value={form.dbt_command}
                    onChange={e =>
                      handleFormChange('dbt_command', e.target.value as ScheduleFormState['dbt_command'])
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                  >
                    <option value="run">dbt run</option>
                    <option value="test">dbt test</option>
                    <option value="seed">dbt seed</option>
                    <option value="docs generate">dbt docs generate</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={e => handleFormChange('description', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Cron Expression
                  </label>
                  <input
                    type="text"
                    value={form.cron_expression}
                    onChange={e => handleFormChange('cron_expression', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm font-mono"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Standard cron format, e.g. <code>0 * * * *</code> for hourly.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Timezone</label>
                  <input
                    type="text"
                    value={form.timezone}
                    onChange={e => handleFormChange('timezone', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Environment
                  </label>
                  <select
                    value={form.environment_id}
                    onChange={e =>
                      handleFormChange(
                        'environment_id',
                        e.target.value ? Number(e.target.value) : '',
                      )
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                  >
                    <option value="">Select environment</option>
                    {environments.map(env => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Max Retries
                  </label>
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Retry Delay (seconds)
                  </label>
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Backoff Strategy
                  </label>
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="exponential">Exponential</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Catch-up Policy
                  </label>
                  <select
                    value={form.catch_up_policy}
                    onChange={e =>
                      handleFormChange('catch_up_policy', e.target.value as CatchUpPolicy)
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                  >
                    <option value="skip">Skip missed</option>
                    <option value="catch_up">Catch up</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Overlap Policy
                  </label>
                  <select
                    value={form.overlap_policy}
                    onChange={e =>
                      handleFormChange('overlap_policy', e.target.value as OverlapPolicy)
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm"
                  >
                    <option value="no_overlap">No overlap</option>
                    <option value="allow_overlap">Allow overlap</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2 mt-4">
                  <input
                    id="enabled"
                    type="checkbox"
                    checked={form.enabled}
                    onChange={e => handleFormChange('enabled', e.target.checked)}
                    className="h-4 w-4 text-accent border-gray-300 rounded"
                  />
                  <label htmlFor="enabled" className="text-sm text-gray-700">
                    Enabled
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setMode(selectedSchedule ? 'detail' : 'list');
                  }}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-accent hover:bg-accent/90 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {mode === 'detail' && selectedSchedule && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedSchedule.name}</h2>
                    <p className="text-sm text-gray-500">
                      dbt {selectedSchedule.dbt_command} ·{' '}
                      {renderStatusBadge(selectedSchedule.status)}
                    </p>
                  </div>
                  {isDeveloperOrAdmin && (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleRunNow}
                        className="px-3 py-1 text-sm rounded-md border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                      >
                        Run now
                      </button>
                      <button
                        onClick={handleTestNotifications}
                        className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        Test notifications
                      </button>
                      <button
                        onClick={handleEditClick}
                        className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={handlePauseResume}
                        className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
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
                    <dt className="font-medium text-gray-700">Cron</dt>
                    <dd className="mt-1 font-mono text-gray-900">
                      {selectedSchedule.cron_expression}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-700">Timezone</dt>
                    <dd className="mt-1 text-gray-900">{selectedSchedule.timezone}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-700">Next Run</dt>
                    <dd className="mt-1 text-gray-900">
                      {selectedSchedule.next_run_time
                        ? new Date(selectedSchedule.next_run_time).toLocaleString()
                        : 'n/a'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-700">Last Run</dt>
                    <dd className="mt-1 text-gray-900">
                      {selectedSchedule.last_run_time
                        ? new Date(selectedSchedule.last_run_time).toLocaleString()
                        : 'n/a'}
                    </dd>
                  </div>
                </dl>
              </div>

              {notificationResult && (
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-md font-semibold mb-2">Notification test results</h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {notificationResult.results.map(result => (
                      <li key={result.channel}>
                        <span className="font-medium">{result.channel}</span>:{' '}
                        {result.success ? (
                          <span className="text-green-700">success</span>
                        ) : (
                          <span className="text-red-700">
                            failed{result.error_message ? ` – ${result.error_message}` : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-md font-semibold">Historical Runs</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Run
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Trigger
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Attempts
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Scheduled
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Started
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Finished
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {runs.map(run => (
                        <tr key={run.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {run.id}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {run.triggering_event}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            <StatusBadge status={run.status} />
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {run.attempts_total}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {new Date(run.scheduled_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {run.started_at ? new Date(run.started_at).toLocaleString() : 'n/a'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {run.finished_at ? new Date(run.finished_at).toLocaleString() : 'n/a'}
                          </td>
                        </tr>
                      ))}
                      {runs.length === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-6 text-center text-sm text-gray-500"
                          >
                            No runs found for this schedule.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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