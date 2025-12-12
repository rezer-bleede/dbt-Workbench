import { api } from '../api/client'
import { WorkspaceSummary } from '../types'

export class WorkspaceService {
  static async listWorkspaces(): Promise<WorkspaceSummary[]> {
    const res = await api.get<WorkspaceSummary[]>('/workspaces')
    return res.data
  }

  static async getActiveWorkspace(): Promise<WorkspaceSummary> {
    const res = await api.get<WorkspaceSummary>('/workspaces/active')
    return res.data
  }
}