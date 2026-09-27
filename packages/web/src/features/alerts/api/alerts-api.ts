import { SeekPage } from '@fema-ipaas/core-utils';
import {
  AlertPolicy,
  AlertRecord,
  AlertRecordStats,
  ListAlertRecordsRequestQuery,
  NotificationChannel,
  TestNotificationChannelResponse,
  UpsertAlertPolicyRequestBody,
  UpsertNotificationChannelRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const alertsApi = {
  capabilities(): Promise<{ emailConfigured: boolean }> {
    return api.get<{ emailConfigured: boolean }>('/v1/alerts/capabilities');
  },
  listChannels(): Promise<NotificationChannel[]> {
    return api.get<NotificationChannel[]>('/v1/alerts/channels');
  },
  createChannel(
    request: UpsertNotificationChannelRequestBody,
  ): Promise<NotificationChannel> {
    return api.post<NotificationChannel>('/v1/alerts/channels', request);
  },
  updateChannel(
    id: string,
    request: UpsertNotificationChannelRequestBody,
  ): Promise<NotificationChannel> {
    return api.post<NotificationChannel>(`/v1/alerts/channels/${id}`, request);
  },
  deleteChannel(id: string): Promise<void> {
    return api.delete<void>(`/v1/alerts/channels/${id}`);
  },
  testChannel(id: string): Promise<TestNotificationChannelResponse> {
    return api.post<TestNotificationChannelResponse>(
      `/v1/alerts/channels/${id}/test`,
      {},
    );
  },
  listPolicies(): Promise<AlertPolicy[]> {
    return api.get<AlertPolicy[]>('/v1/alerts/policies');
  },
  createPolicy(request: UpsertAlertPolicyRequestBody): Promise<AlertPolicy> {
    return api.post<AlertPolicy>('/v1/alerts/policies', request);
  },
  updatePolicy(
    id: string,
    request: UpsertAlertPolicyRequestBody,
  ): Promise<AlertPolicy> {
    return api.post<AlertPolicy>(`/v1/alerts/policies/${id}`, request);
  },
  deletePolicy(id: string): Promise<void> {
    return api.delete<void>(`/v1/alerts/policies/${id}`);
  },
  listRecords(
    request: ListAlertRecordsRequestQuery,
  ): Promise<SeekPage<AlertRecord>> {
    return api.get<SeekPage<AlertRecord>>('/v1/alerts/records', request);
  },
  recordStats(): Promise<AlertRecordStats> {
    return api.get<AlertRecordStats>('/v1/alerts/records/stats');
  },
};
