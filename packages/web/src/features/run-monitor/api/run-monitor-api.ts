import {
  CreateRunMonitorViewRequestBody,
  RunMonitorAiUsage,
  RunMonitorOptions,
  RunMonitorRange,
  RunMonitorSummary,
  RunMonitorView,
  UpdateRunMonitorViewRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const runMonitorApi = {
  summary(query: RunMonitorRequest): Promise<RunMonitorSummary> {
    return api.get<RunMonitorSummary>('/v1/run-monitor/summary', query);
  },
  aiUsage(query: RunMonitorRequest): Promise<RunMonitorAiUsage> {
    return api.get<RunMonitorAiUsage>('/v1/run-monitor/ai-usage', query);
  },
  options(): Promise<RunMonitorOptions> {
    return api.get<RunMonitorOptions>('/v1/run-monitor/options');
  },
  listViews(): Promise<RunMonitorView[]> {
    return api.get<RunMonitorView[]>('/v1/run-monitor/views');
  },
  createView(
    request: CreateRunMonitorViewRequestBody,
  ): Promise<RunMonitorView> {
    return api.post<RunMonitorView>('/v1/run-monitor/views', request);
  },
  updateView({
    id,
    request,
  }: {
    id: string;
    request: UpdateRunMonitorViewRequestBody;
  }): Promise<RunMonitorView> {
    return api.post<RunMonitorView>(`/v1/run-monitor/views/${id}`, request);
  },
  deleteView(id: string): Promise<void> {
    return api.delete<void>(`/v1/run-monitor/views/${id}`);
  },
};

export type RunMonitorRequest = {
  range: RunMonitorRange;
  timezone: string;
  projectIds: string[];
  workflowIds: string[];
};
