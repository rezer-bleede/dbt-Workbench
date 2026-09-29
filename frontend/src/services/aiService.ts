import { api } from '../api/client'
import { loadWorkspaceId } from '../storage/workspaceStorage'
import {
  AiActionProposal,
  AiActionResolveResponse,
  AiChatStreamRequest,
  AiConversation,
  AiMcpServer,
  AiMcpServerCreate,
  AiMcpServerUpdate,
  AiMessage,
  AiSecretsUpdateRequest,
  AiSecretsUpdateResponse,
  AiSettings,
  AiSettingsUpdate,
  AiStreamEvent,
} from '../types/ai'

function getApiBase() {
  return (api.defaults.baseURL || '').replace(/\/$/, '') || 'http://localhost:8080'
}

function getAuthToken(): string | null {
  try {
    const raw = window.localStorage.getItem('dbt_workbench_auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.accessToken || null
  } catch {
    return null
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = getAuthToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const workspaceId = loadWorkspaceId()
  if (workspaceId != null) {
    headers['X-Workspace-Id'] = String(workspaceId)
  }
  return headers
}

export const AiService = {
  getSettings: async (): Promise<AiSettings> => {
    const response = await api.get<AiSettings>('/ai/settings')
    return response.data
  },

  updateSettings: async (payload: AiSettingsUpdate): Promise<AiSettings> => {
    const response = await api.put<AiSettings>('/ai/settings', payload)
    return response.data
  },

  updateSecrets: async (payload: AiSecretsUpdateRequest): Promise<AiSecretsUpdateResponse> => {
    const response = await api.put<AiSecretsUpdateResponse>('/ai/settings/secrets', payload)
    return response.data
  },

  listMcpServers: async (): Promise<AiMcpServer[]> => {
    const response = await api.get<AiMcpServer[]>('/ai/mcp/servers')
    return response.data
  },

  createMcpServer: async (payload: AiMcpServerCreate): Promise<AiMcpServer> => {
    const response = await api.post<AiMcpServer>('/ai/mcp/servers', payload)
    return response.data
  },

  updateMcpServer: async (serverId: number, payload: AiMcpServerUpdate): Promise<AiMcpServer> => {
    const response = await api.put<AiMcpServer>(`/ai/mcp/servers/${serverId}`, payload)
    return response.data
  },

  deleteMcpServer: async (serverId: number): Promise<void> => {
    await api.delete(`/ai/mcp/servers/${serverId}`)
  },

  listConversations: async (): Promise<AiConversation[]> => {
    const response = await api.get<AiConversation[]>('/ai/conversations')
    return response.data
  },

  createConversation: async (title: string): Promise<AiConversation> => {
    const response = await api.post<AiConversation>('/ai/conversations', { title })
    return response.data
  },

  listMessages: async (conversationId: number): Promise<AiMessage[]> => {
    const response = await api.get<AiMessage[]>(`/ai/conversations/${conversationId}/messages`)
    return response.data
  },

  getProposal: async (proposalId: string): Promise<AiActionProposal> => {
    const response = await api.get<AiActionProposal>(`/ai/actions/${proposalId}`)
    return response.data
  },

  confirmProposal: async (proposalId: string): Promise<AiActionResolveResponse> => {
    const response = await api.post<AiActionResolveResponse>(`/ai/actions/${proposalId}/confirm`)
    return response.data
  },

  rejectProposal: async (proposalId: string): Promise<AiActionResolveResponse> => {
    const response = await api.post<AiActionResolveResponse>(`/ai/actions/${proposalId}/reject`)
    return response.data
  },

  streamChat: async (
    payload: AiChatStreamRequest,
    handlers: {
      onEvent: (event: AiStreamEvent) => void
      onError?: (message: string) => void
      signal?: AbortSignal
    },
  ): Promise<void> => {
    const response = await fetch(`${getApiBase()}/ai/chat/stream`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: handlers.signal,
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(body || `AI chat failed (${response.status})`)
    }
    if (!response.body) {
      throw new Error('AI stream is unavailable')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    const flushChunk = (chunk: string) => {
      const blocks = chunk.split('\n\n')
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        if (!block.trim()) continue
        let eventName = 'message'
        const dataLines: string[] = []

        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim())
          }
        }

        const rawData = dataLines.join('\n')
        let parsedData: any = rawData
        try {
          parsedData = rawData ? JSON.parse(rawData) : {}
        } catch {
          parsedData = { message: rawData }
        }

        const event = { event: eventName, data: parsedData } as AiStreamEvent
        handlers.onEvent(event)
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      flushChunk(buffer)
    }

    if (buffer.trim()) {
      flushChunk(buffer + '\n\n')
    }
  },
}
