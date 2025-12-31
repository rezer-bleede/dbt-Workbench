import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SchedulesPage from './Schedules'
import { SchedulerService } from '../services/schedulerService'
import { UserSummary } from '../types'

vi.mock('../services/schedulerService')

const mockedScheduler = vi.mocked(SchedulerService)

const authValue = {
  isLoading: false,
  isAuthEnabled: false,
  user: {
    id: 1,
    username: 'tester',
    role: 'admin',
    is_active: true,
    workspaces: [],
  } as UserSummary,
  accessToken: null,
  refreshToken: null,
  activeWorkspace: {
    id: 1,
    key: 'default',
    name: 'Default',
    description: null,
    artifacts_path: '/tmp',
  },
  login: vi.fn(),
  logout: vi.fn(),
  switchWorkspace: vi.fn(),
}

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authValue,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const scheduledRun = {
  id: 1,
  schedule_id: 1,
  triggering_event: 'manual' as const,
  status: 'failure' as const,
  retry_status: 'exhausted' as const,
  attempts_total: 1,
  scheduled_at: '2025-12-31T19:14:28Z',
  queued_at: '2025-12-31T19:14:28Z',
  started_at: '2025-12-31T19:14:30Z',
  finished_at: '2025-12-31T19:14:31Z',
  environment_snapshot: {},
  command: {},
  log_links: { stderr: 'https://example.com/stderr.log' },
  artifact_links: { manifest: 'https://example.com/manifest.json' },
  attempts: [
    {
      id: 10,
      attempt_number: 1,
      run_id: 'abc123',
      status: 'failed' as const,
      queued_at: '2025-12-31T19:14:28Z',
      started_at: '2025-12-31T19:14:30Z',
      finished_at: '2025-12-31T19:14:31Z',
      error_message: 'dbt compile failed: relation not found',
    },
  ],
}

const scheduleDetails = {
  id: 1,
  name: 'Nightly Build',
  description: 'Nightly job',
  environment_id: 1,
  dbt_command: 'run' as const,
  status: 'active' as const,
  next_run_time: '2025-12-31T20:00:00Z',
  last_run_time: '2025-12-31T19:14:31Z',
  enabled: true,
  cron_expression: '0 0 * * *',
  timezone: 'UTC',
  notification_config: {},
  retry_policy: { max_retries: 0, delay_seconds: 60, backoff_strategy: 'fixed', max_delay_seconds: null },
  retention_policy: null,
  catch_up_policy: 'skip' as const,
  overlap_policy: 'no_overlap' as const,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

const environments = [
  {
    id: 1,
    name: 'Prod',
    description: 'Production env',
    dbt_target_name: 'prod',
    connection_profile_reference: 'default',
    variables: {},
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
]

describe('SchedulesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedScheduler.listSchedules.mockResolvedValue([
      {
        id: 1,
        name: 'Nightly Build',
        description: 'Nightly job',
        environment_id: 1,
        dbt_command: 'run',
        status: 'active',
        next_run_time: null,
        last_run_time: null,
        enabled: true,
      },
    ])

    mockedScheduler.listEnvironments.mockResolvedValue(environments)
    mockedScheduler.getOverview.mockResolvedValue({
      active_schedules: 1,
      paused_schedules: 0,
      next_run_times: { 1: null },
      total_scheduled_runs: 1,
      total_successful_runs: 0,
      total_failed_runs: 1,
    })
    mockedScheduler.getSchedule.mockResolvedValue(scheduleDetails)
    mockedScheduler.getScheduleRuns.mockResolvedValue({ schedule_id: 1, runs: [scheduledRun] })
  })

  it('shows failure reasons for scheduled runs', async () => {
    render(<SchedulesPage />)

    await userEvent.click(await screen.findByText('Nightly Build'))

    await waitFor(() => {
      expect(mockedScheduler.getScheduleRuns).toHaveBeenCalledWith(1)
    })

    expect(await screen.findByText('dbt compile failed: relation not found')).toBeInTheDocument()
  })

  it('expands run details with attempts and debug links', async () => {
    render(<SchedulesPage />)
    const user = userEvent.setup()

    await user.click(await screen.findByText('Nightly Build'))
    await user.click(await screen.findByRole('button', { name: /view details/i }))

    expect(await screen.findByText('Attempt 1')).toBeInTheDocument()
    expect(screen.getByText('View stderr log')).toHaveAttribute('href', 'https://example.com/stderr.log')
    expect(screen.getByText('View manifest')).toHaveAttribute('href', 'https://example.com/manifest.json')
  })
})
