import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    mockedService.files.mockResolvedValue([{ name: 'model.sql', path: 'models/model.sql', type: 'file', category: 'models' }])
    mockedService.history.mockResolvedValue([
      { commit_hash: 'abc1234', author: 'tester', message: 'init', timestamp: new Date().toISOString() },
    ])
    mockedService.audit.mockResolvedValue([])
    mockedService.diff.mockResolvedValue([{ path: 'models/model.sql', diff: '' }])
    mockedService.readFile.mockResolvedValue({ path: 'models/model.sql', content: 'select 1', readonly: false })
    mockedService.writeFile.mockResolvedValue({ is_valid: true })
    mockedService.createFile.mockResolvedValue({ is_valid: true })
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

  it('renders git panels and file explorer', async () => {
    render(<VersionControlPage />)

    await waitFor(() => {
      expect(screen.getByText('Git status')).toBeInTheDocument()
    })

    expect(screen.getByText('Project files')).toBeInTheDocument()
    expect(await screen.findByText(/models\/model.sql/)).toBeInTheDocument()
  })

  it('shows branch metadata and recent history when repository is connected', async () => {
    render(<VersionControlPage />)

    const branchSelect = await screen.findByRole('combobox')

    await waitFor(() => expect(branchSelect).toHaveValue('main'))
    expect(screen.getByText(/Recent commits/)).toBeInTheDocument()
    expect(screen.getByText('init')).toBeInTheDocument()
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
    expect(screen.getByText('Connect a repository to browse files.')).toBeInTheDocument()
  })

  it('allows editing and saving a selected file', async () => {
    render(<VersionControlPage />)

    const fileButton = await screen.findByText(/models\/model.sql/)
    await userEvent.click(fileButton)

    const editor = await screen.findByDisplayValue('select 1')
    await userEvent.type(editor, ' from source')

    const saveButton = await screen.findByRole('button', { name: 'Save file' })
    await userEvent.click(saveButton)

    await waitFor(() => expect(mockedService.writeFile).toHaveBeenCalled())
    expect(mockedService.writeFile.mock.calls[0][0].path).toBe('models/model.sql')
  })

  it('creates a new file from the project panel', async () => {
    render(<VersionControlPage />)

    const pathInput = await screen.findByPlaceholderText('models/new_file.sql')
    const [createContent] = screen.getAllByPlaceholderText('File contents')
    await userEvent.type(pathInput, 'models/new_model.sql')
    await userEvent.type(createContent, 'select 1')

    const createButton = screen.getByRole('button', { name: 'Create file' })
    await userEvent.click(createButton)

    await waitFor(() => expect(mockedService.createFile).toHaveBeenCalled())
    expect(mockedService.createFile.mock.calls[0][0]).toMatchObject({ path: 'models/new_model.sql', content: 'select 1' })
  })
})
