import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import VersionControlPage from './VersionControl'
import { GitService } from '../services/gitService'
import { WorkspaceService } from '../services/workspaceService'
import { UserSummary } from '../types'

vi.mock('../services/gitService')
vi.mock('../services/workspaceService')

const mockedService = vi.mocked(GitService)
const mockedWorkspace = vi.mocked(WorkspaceService)

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
    vi.clearAllMocks()
    mockedService.status.mockResolvedValue({
      branch: 'main',
      is_clean: true,
      ahead: 0,
      behind: 0,
      changes: [],
      has_conflicts: false,
    })
    mockedService.branches.mockResolvedValue([{ name: 'main', is_active: true }])
    mockedService.history.mockResolvedValue([
      { commit_hash: 'abc1234', author: 'tester', message: 'init', timestamp: new Date().toISOString() },
    ])
    mockedService.audit.mockResolvedValue([])
    mockedService.getRepository.mockResolvedValue({
      id: 1,
      workspace_id: 1,
      remote_url: 'https://example.com/repo.git',
      provider: 'github',
      default_branch: 'main',
      directory: '/app/data/demo-project',
      last_synced_at: null,
    })
    mockedWorkspace.listWorkspaces.mockResolvedValue([])
  })

  it('renders git panels and project section', async () => {
    render(<VersionControlPage />)

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Working Changes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Repository' })).toBeInTheDocument()
  })

  it('shows branch metadata and recent history when repository is connected', async () => {
    render(<VersionControlPage />)

    const branchSelect = await screen.findByRole('combobox')

    await waitFor(() => expect(branchSelect).toHaveValue('main'))
    expect(screen.getAllByText(/Recent commits/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('init').length).toBeGreaterThan(0)
  })

  it('prompts for connection details when git is not configured', async () => {
    mockedService.status.mockResolvedValueOnce({
      branch: '',
      is_clean: true,
      ahead: 0,
      behind: 0,
      changes: [],
      has_conflicts: false,
      configured: false,
    })

    render(<VersionControlPage />)

    expect(await screen.findByText('Create or connect a project')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Project workspace name')).toBeInTheDocument()
  })
})
