import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import PluginsInstalledPage from '../PluginsInstalled'
import PluginMarketplacePage from '../PluginMarketplace'
import { PluginService } from '../../services/pluginService'

vi.mock('../../services/pluginService', () => ({
  PluginService: {
    list: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    reload: vi.fn(),
    getAdapterSuggestions: vi.fn(),
    installPackage: vi.fn(),
    upgradePackage: vi.fn(),
  },
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthEnabled: false,
    user: null,
    accessToken: null,
    refreshToken: null,
    activeWorkspace: null,
    login: vi.fn(),
    logout: vi.fn(),
    switchWorkspace: vi.fn(),
  }),
}))

const mockedService = PluginService as any

const samplePlugin = {
  name: 'demo',
  version: '1.0.0',
  description: 'Demo plugin',
  author: 'dbt',
  capabilities: ['extend-api'],
  permissions: [],
  enabled: true,
  last_error: null,
  compatibility_ok: true,
  screenshots: [],
  homepage: null,
}

describe('Plugin pages', () => {
  beforeEach(() => {
    mockedService.list.mockResolvedValue([samplePlugin])
    mockedService.getAdapterSuggestions.mockResolvedValue([])
    mockedService.enable.mockResolvedValue({ ...samplePlugin, enabled: true })
    mockedService.disable.mockResolvedValue({ ...samplePlugin, enabled: false })
    mockedService.reload.mockResolvedValue([samplePlugin])
  })

  it('renders installed plugins and adapter suggestions', async () => {
    render(<PluginsInstalledPage />)

    await waitFor(() => screen.getByText('Installed Plugins'))

    expect(screen.getByText('Installed Plugins')).toBeInTheDocument()
    expect(screen.getByText('dbt Adapters')).toBeInTheDocument()
    expect(screen.getByText('demo')).toBeInTheDocument()
    expect(screen.getByText('Demo plugin')).toBeInTheDocument()
  })

  it('renders marketplace view and toggles plugin state', async () => {
    render(<PluginMarketplacePage />)
    await waitFor(() => screen.getByText(/Plugin Marketplace/))

    expect(screen.getByText('Demo plugin')).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /disable/i })
    await userEvent.click(toggle)
    expect(mockedService.disable).toHaveBeenCalledWith('demo')
  })
})

