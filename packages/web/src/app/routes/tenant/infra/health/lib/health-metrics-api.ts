import {
  TenantMetricsHealthHistory,
  TenantMetricsLive,
  TenantMetricsReport,
} from '@fema/shared';

import { api } from '@/lib/api';

export const healthMetricsApi = {
  getRunMetrics(range: {
    createdAfter: string;
    createdBefore: string;
  }): Promise<TenantMetricsReport> {
    return api.get<TenantMetricsReport>('/v1/health/run-metrics', range);
  },
  getQueueMetrics(range: {
    createdAfter: string;
    createdBefore: string;
  }): Promise<TenantMetricsLive> {
    return api.get<TenantMetricsLive>('/v1/health/queue-metrics', range);
  },
  getHealthHistory(): Promise<TenantMetricsHealthHistory> {
    return api.get<TenantMetricsHealthHistory>('/v1/health/history');
  },
};
