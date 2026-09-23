import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import EnvironmentsPage from './Environments'
import { EnvironmentService } from '../services/environmentService'
import { ProfileService } from '../services/profileService'
import { UserSummary } from '../types'

vi.mock('../services/environmentService')
vi.mock('../services/profileService')

const mockedEnvService = vi.mocked(EnvironmentService)
const mockedProfileService = vi.mocked(ProfileService)

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

const initialProfilesYaml = 'default:\n  target: dev\n  outputs:\n    dev:\n      type: postgres\n      host: localhost\n      user: dbt\n      password: secret\n'

describe('EnvironmentsPage profile management', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockedEnvService.list.mockResolvedValue([
      {
        id: 1,
        name: 'Dev',
        description: 'Development',
        dbt_target_name: 'dev',
        connection_profile_reference: 'default',
        variables: {},
        created_at: '',
        updated_at: '',
      },
    ])

    mockedProfileService.get.mockResolvedValue({
      content: initialProfilesYaml,
      profiles: [
        {
          name: 'default',
          targets: ['dev'],
        },
      ],
    })

    mockedProfileService.update.mockResolvedValue({
      content: initialProfilesYaml,
      profiles: [
        {
          name: 'default',
          targets: ['dev'],
        },
      ],
    })
  })

  it('shows profile cards with targets', async () => {
    render(<EnvironmentsPage />)

    expect(await screen.findByText('Default dbt Project')).toBeInTheDocument()
    const profileLabels = await screen.findAllByText('default')
    expect(profileLabels.length).toBeGreaterThan(0)
    expect(screen.getByText('1 target')).toBeInTheDocument()
  })

  it('merges new profiles when saving the snippet editor', async () => {
    mockedProfileService.update.mockResolvedValue({
      content: `${initialProfilesYaml}\nanalytics:\n  target: dev\n  outputs:\n    dev:\n      type: duckdb\n      path: file.db\n`,
      profiles: [
        { name: 'default', targets: ['dev'] },
        { name: 'analytics', targets: ['dev'] },
      ],
    })

    render(<EnvironmentsPage />)

    const user = userEvent.setup()

    await user.click(await screen.findByText('New Profile'))

    const textarea = await screen.findByRole('textbox')
    await user.clear(textarea)
    await user.type(
      textarea,
      'analytics:\n  target: dev\n  outputs:\n    dev:\n      type: duckdb\n      path: file.db\n'
    )

    await user.click(screen.getByText('Save Profile'))

    await waitFor(() => {
      expect(mockedProfileService.update).toHaveBeenCalled()
      expect(mockedProfileService.update.mock.calls[0][0]).toContain('analytics:')
      expect(mockedProfileService.update.mock.calls[0][0]).toContain('default:')
    })

    expect(await screen.findByText('analytics')).toBeInTheDocument()
  })

  it('shows validation errors when snippet is not a mapping', async () => {
    render(<EnvironmentsPage />)

    const user = userEvent.setup()

    await user.click(await screen.findByText('New Profile'))
    const textarea = await screen.findByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, '- not-a-map')

    await user.click(screen.getByText('Save Profile'))

    expect(await screen.findByText('Profile definition must be a YAML object')).toBeInTheDocument()
    expect(mockedProfileService.update).not.toHaveBeenCalled()
  })

  it('removes old profile key when a profile is renamed in snippet editor', async () => {
    render(<EnvironmentsPage />)

    const user = userEvent.setup()

    // Wait for "Default dbt Project" section
    await screen.findByText('Default dbt Project')

    // Find the profile card containing "default" and its "Edit" button
    const defaultHeadings = screen.getAllByText('default')
    const card = defaultHeadings[0].closest('div')?.parentElement
    const editBtn = card?.querySelector('button') as HTMLButtonElement
    await user.click(editBtn)

    const textarea = await screen.findByRole('textbox')
    await user.clear(textarea)
    await user.type(
      textarea,
      'renamed_profile:\n  target: dev\n  outputs:\n    dev:\n      type: postgres\n'
    )

    await user.click(screen.getByText('Save Profile'))

    await waitFor(() => {
      expect(mockedProfileService.update).toHaveBeenCalled()
      const updatedYaml = mockedProfileService.update.mock.calls[0][0]
      expect(updatedYaml).toContain('renamed_profile:')
      expect(updatedYaml).not.toContain('default:')
    })
  })

  it('allows typing variables as JSON string and validates invalid JSON on save', async () => {
    mockedEnvService.create.mockResolvedValue({
      id: 2,
      name: 'Staging',
      description: 'Staging env',
      dbt_target_name: 'dev',
      connection_profile_reference: 'default',
      variables: { key: 'val' },
      created_at: '',
      updated_at: '',
    })

    render(<EnvironmentsPage />)
    const user = userEvent.setup()

    await user.click(await screen.findByText('New Environment'))

    const nameInput = screen.getByPlaceholderText('Production')
    fireEvent.change(nameInput, { target: { value: 'Staging' } })

    const textareas = screen.getAllByRole('textbox')
    const varsTextarea = textareas[textareas.length - 1]

    // Type invalid JSON
    fireEvent.change(varsTextarea, { target: { value: '{\n"invalid": ' } })

    await user.click(screen.getByText('Save'))
    expect(await screen.findByText('Variables must be valid JSON')).toBeInTheDocument()
    expect(mockedEnvService.create).not.toHaveBeenCalled()

    // Type valid JSON
    fireEvent.change(varsTextarea, { target: { value: '{\n"key": "val"\n}' } })

    await user.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockedEnvService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Staging',
          variables: { key: 'val' },
        })
      )
    })
  })

  it('renders the profiles panel with gradient panel styling', async () => {
    render(<EnvironmentsPage />)

    const heading = await screen.findByText('Default dbt Project')
    const panel = heading.closest('div')?.parentElement?.parentElement as HTMLElement | null

    expect(panel).not.toBeNull()
    expect(panel).toHaveClass('panel-gradient')
  })
})
