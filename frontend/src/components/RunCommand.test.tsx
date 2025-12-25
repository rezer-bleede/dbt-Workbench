import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { RunCommand } from './RunCommand'
import { api } from '../api/client'
import { ExecutionService } from '../services/executionService'
import { EnvironmentService } from '../services/environmentService'

vi.mock('../api/client', () => ({ api: { get: vi.fn() } }))
vi.mock('../services/executionService', () => ({ ExecutionService: { startRun: vi.fn() } }))
vi.mock('../services/environmentService', () => ({ EnvironmentService: { list: vi.fn() } }))

const mockedApi = api as { get: ReturnType<typeof vi.fn> }
const mockedExecutionService = ExecutionService as { startRun: ReturnType<typeof vi.fn> }
const mockedEnvironmentService = EnvironmentService as { list: ReturnType<typeof vi.fn> }

const authValue = {
  isLoading: false,
  isAuthEnabled: false,
  user: { id: 1, username: 'tester', role: 'admin' },
  activeWorkspace: { id: 1, key: 'default', name: 'Default', artifacts_path: '/tmp' },
  workspaces: [{ id: 1, key: 'default', name: 'Default', artifacts_path: '/tmp' }],
  accessToken: null,
  refreshToken: null,
  login: vi.fn(),
  logout: vi.fn(),
  switchWorkspace: vi.fn(),
}

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authValue,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('RunCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.get.mockResolvedValue({ data: [] })
    mockedEnvironmentService.list.mockResolvedValue([])
    mockedExecutionService.startRun.mockResolvedValue({ run_id: '123' })
  })

  it('starts the selected command when an action button is clicked', async () => {
    const onRunStarted = vi.fn()
    render(<RunCommand onRunStarted={onRunStarted} />)

    await userEvent.click(screen.getByTestId('run-execute'))

    await waitFor(() => expect(mockedExecutionService.startRun).toHaveBeenCalled())
    expect(mockedExecutionService.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'run' })
    )
    expect(onRunStarted).toHaveBeenCalledWith('123')
  })

  it('passes command-specific options with the executed command', async () => {
    render(<RunCommand />)

    const [testSelection] = screen.getAllByRole('button', { name: 'Test' })
    await userEvent.click(testSelection)
    await userEvent.click(screen.getByLabelText('Store Failures'))
    await userEvent.click(screen.getByTestId('test-execute'))

    await waitFor(() => expect(mockedExecutionService.startRun).toHaveBeenCalled())
    const runRequest = mockedExecutionService.startRun.mock.calls[0][0]
    expect(runRequest.command).toBe('test')
    expect(runRequest.parameters.store_failures).toBe(true)
  })

  it('executes the command tied to the clicked action even after switching selection', async () => {
    render(<RunCommand />)

    const [testSelection] = screen.getAllByRole('button', { name: 'Test' })
    await userEvent.click(testSelection)
    await userEvent.click(screen.getByLabelText('Store Failures'))

    await userEvent.click(screen.getByTestId('seed-execute'))

    await waitFor(() => expect(mockedExecutionService.startRun).toHaveBeenCalled())
    const runRequest = mockedExecutionService.startRun.mock.calls[0][0]
    expect(runRequest.command).toBe('seed')
    expect(runRequest.parameters).not.toHaveProperty('store_failures')
  })
})
