import { 
  RunRequest, 
  RunSummary, 
  RunDetail, 
  RunHistoryResponse, 
  RunArtifactsResponse,
  LogMessage 
} from '../types';

const API_BASE = 'http://localhost:8000';

export class ExecutionService {
  static async startRun(request: RunRequest): Promise<RunSummary> {
    const response = await fetch(`${API_BASE}/execution/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to start run');
    }

    return response.json();
  }

  static async getRunStatus(runId: string): Promise<RunSummary> {
    const response = await fetch(`${API_BASE}/execution/runs/${runId}`);
    
    if (!response.ok) {
      throw new Error('Failed to get run status');
    }

    return response.json();
  }

  static async getRunDetail(runId: string): Promise<RunDetail> {
    const response = await fetch(`${API_BASE}/execution/runs/${runId}/detail`);
    
    if (!response.ok) {
      throw new Error('Failed to get run detail');
    }

    return response.json();
  }

  static async getRunHistory(page: number = 1, pageSize: number = 20): Promise<RunHistoryResponse> {
    const response = await fetch(
      `${API_BASE}/execution/runs?page=${page}&page_size=${pageSize}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get run history');
    }

    return response.json();
  }

  static async getRunArtifacts(runId: string): Promise<RunArtifactsResponse> {
    const response = await fetch(`${API_BASE}/execution/runs/${runId}/artifacts`);
    
    if (!response.ok) {
      throw new Error('Failed to get run artifacts');
    }

    return response.json();
  }

  static async cancelRun(runId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/execution/runs/${runId}/cancel`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to cancel run');
    }
  }

  static createLogStream(runId: string): EventSource {
    return new EventSource(`${API_BASE}/execution/runs/${runId}/logs`);
  }

  static async getExecutionStatus(): Promise<{
    active_runs: number;
    total_runs: number;
    max_concurrent_runs: number;
    max_run_history: number;
  }> {
    const response = await fetch(`${API_BASE}/execution/status`);
    
    if (!response.ok) {
      throw new Error('Failed to get execution status');
    }

    return response.json();
  }
}