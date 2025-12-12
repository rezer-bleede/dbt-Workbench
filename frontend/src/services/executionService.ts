import { 
  RunRequest, 
  RunSummary, 
  RunDetail, 
  RunHistoryResponse, 
  RunArtifactsResponse,
} from '../types';
import { api } from '../api/client';

const getBaseUrl = () => (api.defaults.baseURL || '').replace(/\/$/, '') || 'http://localhost:8000';

export class ExecutionService {
  static async startRun(request: RunRequest): Promise<RunSummary> {
    const response = await api.post<RunSummary>('/execution/runs', request);
    return response.data;
  }

  static async getRunStatus(runId: string): Promise<RunSummary> {
    const response = await api.get<RunSummary>(`/execution/runs/${runId}`);
    return response.data;
  }

  static async getRunDetail(runId: string): Promise<RunDetail> {
    const response = await api.get<RunDetail>(`/execution/runs/${runId}/detail`);
    return response.data;
  }

  static async getRunHistory(page: number = 1, pageSize: number = 20): Promise<RunHistoryResponse> {
    const response = await api.get<RunHistoryResponse>('/execution/runs', {
      params: { page, page_size: pageSize },
    });
    return response.data;
  }

  static async getRunArtifacts(runId: string): Promise<RunArtifactsResponse> {
    const response = await api.get<RunArtifactsResponse>(`/execution/runs/${runId}/artifacts`);
    return response.data;
  }

  static async cancelRun(runId: string): Promise<void> {
    await api.post(`/execution/runs/${runId}/cancel`, {});
  }

  static createLogStream(runId: string): EventSource {
    let accessToken: string | null = null;
    try {
      const storedRaw = window.localStorage.getItem('dbt_workbench_auth');
      if (storedRaw) {
        const stored = JSON.parse(storedRaw);
        accessToken = stored?.accessToken || null;
      }
    } catch {
      accessToken = null;
    }
    const base = getBaseUrl();
    const url = new URL(`/execution/runs/${runId}/logs`, base);
    if (accessToken) {
      url.searchParams.set('access_token', accessToken);
    }
    return new EventSource(url.toString());
  }

  static async getExecutionStatus(): Promise<{
    active_runs: number;
    total_runs: number;
    max_concurrent_runs: number;
    max_run_history: number;
  }> {
    const response = await api.get<{
      active_runs: number;
      total_runs: number;
      max_concurrent_runs: number;
      max_run_history: number;
    }>('/execution/status');
    return response.data;
  }
}