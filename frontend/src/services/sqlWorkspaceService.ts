import { api } from '../api/client';
import {
  CompiledSqlResponse,
  DbtModelExecuteRequest,
  ModelPreviewRequest,
  ModelPreviewResponse,
  SqlAutocompleteMetadata,
  SqlQueryHistoryResponse,
  SqlQueryProfile,
  SqlQueryRequest,
  SqlQueryResult,
} from '../types';

export interface SqlHistoryFilters {
  environment_id?: number;
  model_ref?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  page?: number;
  page_size?: number;
}

export class SqlWorkspaceService {
  static async executeQuery(payload: SqlQueryRequest): Promise<SqlQueryResult> {
    const response = await api.post<SqlQueryResult>('/sql/execute', payload);
    return response.data;
  }

  static async cancelQuery(queryId: string): Promise<void> {
    await api.post(`/sql/queries/${queryId}/cancel`, {});
  }

  static async getHistory(filters: SqlHistoryFilters = {}): Promise<SqlQueryHistoryResponse> {
    const response = await api.get<SqlQueryHistoryResponse>('/sql/history', {
      params: {
        environment_id: filters.environment_id,
        model_ref: filters.model_ref,
        status: filters.status,
        start_time: filters.start_time,
        end_time: filters.end_time,
        page: filters.page,
        page_size: filters.page_size,
      },
    });
    return response.data;
  }

  static async getMetadata(): Promise<SqlAutocompleteMetadata> {
    const response = await api.get<SqlAutocompleteMetadata>('/sql/metadata');
    return response.data;
  }

  static async previewModel(payload: ModelPreviewRequest): Promise<ModelPreviewResponse> {
    const response = await api.post<ModelPreviewResponse>('/sql/preview', payload);
    return response.data;
  }

  static async getCompiledSql(
    modelUniqueId: string,
    params: { environment_id?: number },
  ): Promise<CompiledSqlResponse> {
    const response = await api.get<CompiledSqlResponse>(`/sql/models/${modelUniqueId}/compiled`, { params });
    return response.data;
  }

  static async executeModel(payload: DbtModelExecuteRequest): Promise<SqlQueryResult> {
    if (!payload.model_unique_id) {
      throw new Error('model_unique_id is required to execute a dbt model');
    }
    const response = await api.post<SqlQueryResult>(`/sql/models/${payload.model_unique_id}/run`, payload);
    return response.data;
  }

  static async profileQuery(payload: SqlQueryRequest): Promise<SqlQueryProfile> {
    const response = await api.post<SqlQueryProfile>('/sql/profile', payload);
    return response.data;
  }

  static async deleteHistoryEntry(id: number): Promise<void> {
    await api.delete(`/sql/history/${id}`);
  }
}