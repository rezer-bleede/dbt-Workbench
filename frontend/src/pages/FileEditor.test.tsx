import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import FileEditorPage from './FileEditor'
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

describe('FileEditorPage', () => {
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
    mockedService.files.mockResolvedValue([{ name: 'model.sql', path: 'models/model.sql', type: 'file', category: 'models' }])
    mockedService.diff.mockResolvedValue([{ path: 'models/model.sql', diff: '' }])
    mockedService.readFile.mockResolvedValue({ path: 'models/model.sql', content: 'select 1', readonly: false })
    mockedService.writeFile.mockResolvedValue({ is_valid: true })
    mockedService.createFile.mockResolvedValue({ is_valid: true })
  })

  it('renders project files and editor panel', async () => {
    render(<FileEditorPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'File Editor' })).toBeInTheDocument()
    expect(screen.getByText('Project Files')).toBeInTheDocument()

    const filterInput = await screen.findByLabelText('Filter files')
    const treeRoot = filterInput.closest('div')?.parentElement
    expect(treeRoot).toBeTruthy()

    const treeScope = within(treeRoot as HTMLElement)
    await userEvent.click(treeScope.getByText('Expand all'))

    await waitFor(() => {
      const fileButton = treeScope.getAllByRole('button').find((button) =>
        button.textContent?.includes('model.sql'),
      )
      expect(fileButton).toBeTruthy()
    })
  })

  it('shows repository error message when git is not configured', async () => {
    mockedService.status.mockResolvedValueOnce({
      branch: '',
      is_clean: true,
      ahead: 0,
      behind: 0,
      changes: [],
      has_conflicts: false,
      configured: false,
    })

    render(<FileEditorPage />)

    expect(await screen.findByText('Connect a repository to browse files')).toBeInTheDocument()
  })

  it('allows editing and saving a selected file', async () => {
    render(<FileEditorPage />)

    const filterInput = await screen.findByLabelText('Filter files')
    const treeRoot = filterInput.closest('div')?.parentElement
    expect(treeRoot).toBeTruthy()

    const treeScope = within(treeRoot as HTMLElement)
    await userEvent.click(treeScope.getByText('Expand all'))

    await waitFor(() => {
      const fileButton = treeScope.getAllByRole('button').find((button) =>
        button.textContent?.includes('model.sql'),
      )
      expect(fileButton).toBeTruthy()
    })

    const fileButton = treeScope.getAllByRole('button').find((button) =>
      button.textContent?.includes('model.sql'),
    )
    expect(fileButton).toBeTruthy()
    await userEvent.click(fileButton as HTMLElement)

    const editor = await screen.findByDisplayValue('select 1')
    await userEvent.type(editor, ' from source')

    const saveButton = await screen.findByRole('button', { name: 'Save File' })
    await userEvent.click(saveButton)

    await waitFor(() => expect(mockedService.writeFile).toHaveBeenCalled())
    expect(mockedService.writeFile.mock.calls[0][0].path).toBe('models/model.sql')
  })

  it('creates a new file from panel', async () => {
    render(<FileEditorPage />)

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
