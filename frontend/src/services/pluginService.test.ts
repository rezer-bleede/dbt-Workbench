import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginService } from './pluginService'
import { api } from '../api/client'

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const mockedPost = api.post as any

describe('PluginService', () => {
  beforeEach(() => {
    mockedPost.mockReset()
  })

  it('calls reload with plugin_name as query parameter', async () => {
    mockedPost.mockResolvedValue({ data: { reloaded: [] } })

    await PluginService.reload('demo')

    expect(mockedPost).toHaveBeenCalledWith(
      '/plugins/reload',
      null,
      { params: { plugin_name: 'demo' } },
    )
  })
})