import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'
import { vi } from 'vitest'
import DashboardPage from '../Dashboard'
import { api } from '../../api/client'
import { UserSummary } from '../../types'

vi.mock('../../api/client', () => ({ api: { get: vi.fn() } }))
const mockedApi = api as { get: ReturnType<typeof vi.fn> }

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
      .mockResolvedValueOnce({ data: { manifest: false, run_results: false, catalog: false } })
      .mockResolvedValueOnce({ data: [] })
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

    render(
      <BrowserRouter>
        <DashboardPage />
      </BrowserRouter>
    )

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled())
    expect(screen.getByText(/Projects: 1/)).toBeInTheDocument()
    expect(screen.getByText('Missing')).toBeInTheDocument()
    expect(screen.getAllByText('No runs yet').length).toBeGreaterThan(0)
  })
})
