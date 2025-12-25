import { api } from '../api/client'
import {
  AuditRecord,
  GitBranch,
  GitDiff,
  GitFileContent,
  GitFileNode,
  GitHistoryEntry,
  GitRepository,
  GitStatus,
} from '../types'

export class GitService {
  static async connect(payload: {
    workspace_id: number
    remote_url?: string
    branch: string
    directory?: string
    provider?: string
  }): Promise<GitRepository> {
    const response = await api.post<GitRepository>('/git/connect', payload, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    })
    return response.data
  }

  static async getRepository(): Promise<GitRepository | null> {
    const response = await api.get<GitRepository | null>('/git/repository')
    return response.data
  }

  static async disconnect(deleteFiles: boolean = false): Promise<void> {
    await api.delete('/git/disconnect', { params: { delete_files: deleteFiles } })
  }

  static async status(): Promise<GitStatus> {
    const response = await api.get<GitStatus>('/git/status')
    return response.data
  }

  static async branches(): Promise<GitBranch[]> {
    const response = await api.get<GitBranch[]>('/git/branches')
    return response.data
  }

  static async switchBranch(branch: string): Promise<GitStatus> {
    const response = await api.post<GitStatus>('/git/switch', null, { params: { branch } })
    return response.data
  }

  static async pull(): Promise<GitStatus> {
    const response = await api.post<GitStatus>('/git/pull', {})
    return response.data
  }

  static async push(): Promise<GitStatus> {
    const response = await api.post<GitStatus>('/git/push', {})
    return response.data
  }

  static async commit(message: string, files?: string[]): Promise<string> {
    const response = await api.post<string>('/git/commit', { message, files })
    return response.data
  }

  static async files(): Promise<GitFileNode[]> {
    const response = await api.get<GitFileNode[]>('/git/files')
    return response.data
  }

  static async readFile(path: string): Promise<GitFileContent> {
    const response = await api.get<GitFileContent>('/git/file', { params: { path } })
    return response.data
  }

  static async writeFile(payload: {
    path: string
    content: string
    message?: string
    environment?: string
  }): Promise<{ is_valid: boolean; errors?: string[] }> {
    const response = await api.put('/git/file', payload)
    return response.data as any
  }

  static async createFile(payload: {
    path: string
    content: string
    message?: string
    environment?: string
    category?: string
  }): Promise<{ is_valid: boolean; errors?: string[] }> {
    const response = await api.post('/git/file', payload)
    return response.data as any
  }

  static async deleteFile(path: string, message?: string): Promise<void> {
    await api.delete('/git/file', { data: { path, message } })
  }

  static async diff(path?: string): Promise<GitDiff[]> {
    const response = await api.get<GitDiff[]>('/git/diff', { params: { path } })
    return response.data
  }

  static async history(): Promise<GitHistoryEntry[]> {
    const response = await api.get<GitHistoryEntry[]>('/git/history')
    return response.data
  }

  static async audit(): Promise<AuditRecord[]> {
    const response = await api.get<{ records: AuditRecord[] }>('/git/audit')
    return response.data.records
  }
}
