import {
  EnvironmentConfig,
  NotificationConfig,
  NotificationTestResponse,
  Schedule,
  ScheduleCreate,
  ScheduleMetrics,
  ScheduleSummary,
  ScheduleUpdate,
  ScheduledRun,
  ScheduledRunListResponse,
  SchedulerOverview,
} from '../types';
import { api } from '../api/client';

export interface ScheduleCreatePayload extends Omit<ScheduleCreate, 'environment_id'> {
  environment_id: number;
}

export class SchedulerService {
  static async listSchedules(): Promise<ScheduleSummary[]> {
    const response = await api.get<ScheduleSummary[]>('/schedules');
    return response.data;
  }

  static async getSchedule(id: number): Promise<Schedule> {
    const response = await api.get<Schedule>(`/schedules/${id}`);
    return response.data;
  }

  static async createSchedule(payload: any): Promise<Schedule> {
    const response = await api.post<Schedule>('/schedules', payload);
    return response.data;
  }

  static async updateSchedule(id: number, payload: any): Promise<Schedule> {
    const response = await api.put<Schedule>(`/schedules/${id}`, payload);
    return response.data;
  }

  static async deleteSchedule(id: number): Promise<void> {
    await api.delete(`/schedules/${id}`);
  }

  static async pauseSchedule(id: number): Promise<Schedule> {
    const response = await api.post<Schedule>(`/schedules/${id}/pause`, {});
    return response.data;
  }

  static async resumeSchedule(id: number): Promise<Schedule> {
    const response = await api.post<Schedule>(`/schedules/${id}/resume`, {});
    return response.data;
  }

  static async runScheduleNow(id: number): Promise<ScheduledRun> {
    const response = await api.post<ScheduledRun>(`/schedules/${id}/run`, {});
    return response.data;
  }

  static async getScheduleRuns(id: number): Promise<ScheduledRunListResponse> {
    const response = await api.get<ScheduledRunListResponse>(`/schedules/${id}/runs`);
    return response.data;
  }

  static async getOverview(): Promise<SchedulerOverview> {
    const response = await api.get<SchedulerOverview>('/schedules/overview');
    return response.data;
  }

  static async getScheduleMetrics(id: number): Promise<ScheduleMetrics> {
    const response = await api.get<ScheduleMetrics>(`/schedules/${id}/metrics`);
    return response.data;
  }

  static async testScheduleNotifications(
    scheduleId: number,
    config?: NotificationConfig,
  ): Promise<NotificationTestResponse> {
    const response = await api.post<NotificationTestResponse>(
      `/schedules/${scheduleId}/notifications/test`,
      { notification_config: config },
    );
    return response.data;
  }

  static async listEnvironments(): Promise<EnvironmentConfig[]> {
    const response = await api.get<EnvironmentConfig[]>('/schedules/environments');
    return response.data;
  }

  static async createEnvironment(payload: Partial<EnvironmentConfig>): Promise<EnvironmentConfig> {
    const response = await api.post<EnvironmentConfig>('/schedules/environments', payload);
    return response.data;
  }
}