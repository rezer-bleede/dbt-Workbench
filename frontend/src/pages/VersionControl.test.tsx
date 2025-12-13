import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import VersionControlPage from './VersionControl'
import { GitService } from '../services/gitService'
import { UserSummary } from '../types'

vi.mock('../services/gitService')

const mockedService = vi.mocked(GitService)

const authValue = {
  isLoading: false,
  isAuthEnabled: false,
  user: {
    id: 1,
    username: 'tester',
    role: 'admin',
    full_name: null,
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

describe('VersionControlPage', () => {
  beforeEach(() => {
    mockedService.status.mockResolvedValue({
      branch: 'main',
      is_clean: true,
      ahead: 0,
      behind: 0,
      changes: [],
      has_conflicts: false,
    })
    mockedService.branches.mockResolvedValue([{ name: 'main', is_active: true }])
    mockedService.files.mockResolvedValue([{ name: 'model.sql', path: 'models/model.sql', type: 'file', category: 'models' }])
    mockedService.history.mockResolvedValue([
      { commit_hash: 'abc1234', author: 'tester', message: 'init', timestamp: new Date().toISOString() },
    ])
    mockedService.audit.mockResolvedValue([])
    mockedService.diff.mockResolvedValue([{ path: 'models/model.sql', diff: '' }])
    mockedService.readFile.mockResolvedValue({ path: 'models/model.sql', content: 'select 1', readonly: false })
  })

  it('renders git panels and file explorer', async () => {
    render(<VersionControlPage />)

    await waitFor(() => {
      expect(screen.getByText('Git status')).toBeInTheDocument()
    })

    expect(screen.getByText('Project files')).toBeInTheDocument()
    expect(await screen.findByText(/models\/model.sql/)).toBeInTheDocument()
  })
})
