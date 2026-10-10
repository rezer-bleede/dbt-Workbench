import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'
import { vi } from 'vitest'
import DashboardPage from '../Dashboard'
import { api } from '../../api/client'
import { UserSummary } from '../../types'
import { ExecutionService } from '../../services/executionService'

vi.mock('../../api/client', () => ({ api: { get: vi.fn() } }))
vi.mock('../../services/executionService', () => ({
  ExecutionService: {
    getRunHistory: vi.fn(),
  },
}))

const mockedApi = api as { get: ReturnType<typeof vi.fn> }
const mockedExecutionService = ExecutionService as { getRunHistory: ReturnType<typeof vi.fn> }

const authValue = {
  isLoading: false,
  isAuthEnabled: false,
  user: { id: 1, username: 'tester', role: 'admin' } as UserSummary,
  activeWorkspace: { id: 1, key: 'default', name: 'Default', artifacts_path: '/tmp' },
  workspaces: [{ id: 1, key: 'default', name: 'Default', artifacts_path: '/tmp' }],
  accessToken: null,
  refreshToken: null,
  login: vi.fn(),
  logout: vi.fn(),
  switchWorkspace: vi.fn(),
}

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => authValue,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('DashboardPage', () => {
  it('shows fallback when health is unavailable', async () => {
    mockedApi.get = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ data: { manifest: false, run_results: false, catalog: false, docs: false } })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: {
          id: 1,
          workspace_id: 1,
          remote_url: null,
          provider: 'local',
          default_branch: 'main',
          directory: '/tmp',
          last_synced_at: null,
        },
      })
    mockedExecutionService.getRunHistory = vi.fn().mockResolvedValue({ runs: [], total_count: 0, page: 1, page_size: 20 })

    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    )

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled())
    expect(screen.getByText(/1 workspace/)).toBeInTheDocument()
    expect(screen.getAllByText('Missing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('No runs recorded yet').length).toBeGreaterThan(0)
  })

  it('shows latest run status from execution history', async () => {
    mockedApi.get = vi
      .fn()
      .mockResolvedValueOnce({ data: { status: 'ok' } })
      .mockResolvedValueOnce({ data: { manifest: true, run_results: true, catalog: true, docs: true } })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: {
          id: 1,
          workspace_id: 1,
          remote_url: null,
          provider: 'local',
          default_branch: 'main',
          directory: '/tmp',
          last_synced_at: null,
        },
      })

    mockedExecutionService.getRunHistory = vi.fn().mockResolvedValue({
      runs: [
        {
          run_id: 'run-123',
          command: 'run',
          status: 'succeeded',
          start_time: new Date().toISOString(),
          artifacts_available: true,
        },
      ],
      total_count: 1,
      page: 1,
      page_size: 20,
    })

    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    )

    await waitFor(() => expect(mockedExecutionService.getRunHistory).toHaveBeenCalled())
    expect(await screen.findByText('Passed')).toBeInTheDocument()
  })
})
