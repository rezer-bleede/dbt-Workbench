import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import PluginsInstalledPage from '../PluginsInstalled'
import PluginMarketplacePage from '../PluginMarketplace'

vi.mock('../../services/pluginService', () => ({
  listInstalledPlugins: vi.fn(),
  enablePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  reloadPlugins: vi.fn(),
}))

const mockedService = await import('../../services/pluginService')

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
    mockedService.listInstalledPlugins.mockResolvedValue([samplePlugin])
    mockedService.enablePlugin.mockResolvedValue({ plugin: samplePlugin, action: 'enabled' })
    mockedService.disablePlugin.mockResolvedValue({ plugin: { ...samplePlugin, enabled: false }, action: 'disabled' })
    mockedService.reloadPlugins.mockResolvedValue({ reloaded: [samplePlugin] })
  })

  it('renders installed plugins and toggles state', async () => {
    render(<PluginsInstalledPage />)
    await waitFor(() => screen.getByText('Demo plugin'))
    expect(screen.getByText('demo')).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /disable/i })
    await userEvent.click(toggle)
    expect(mockedService.disablePlugin).toHaveBeenCalledWith('demo')
  })

  it('renders marketplace view', async () => {
    render(<PluginMarketplacePage />)
    await waitFor(() => screen.getByText(/Plugin Marketplace/))
    expect(screen.getByText('Demo plugin')).toBeInTheDocument()
  })
})

