import { SeekPage } from '@fema-ipaas/core-utils';
import {
  AlertRecord,
  BatchUpdateIssuesRequestBody,
  Execution,
  IssueActivity,
  IssueInsight,
  IssueOverview,
  IssueReplayRequestBody,
  IssueReplayResult,
  IssueSummary,
  IssueTrend,
  IssueTrendGranularity,
  IssueWithSeverity,
  ListIssuesRequestQuery,
  ReplayCheckResult,
  UpdateIssueRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';
import { timezoneUtils } from '@/lib/timezone-utils';

export const issuesApi = {
  list(request: ListIssuesRequestQuery): Promise<SeekPage<IssueWithSeverity>> {
    return api.get<SeekPage<IssueWithSeverity>>('/v1/issues', {
      ...request,
      timezone: timezoneUtils.browser(),
    });
  },
  overview(projectId?: string): Promise<IssueOverview> {
    return api.get<IssueOverview>('/v1/issues/overview', { projectId });
  },
  summary(projectId: string): Promise<IssueSummary> {
    return api.get<IssueSummary>('/v1/issues/summary', {
      projectId,
      timezone: timezoneUtils.browser(),
    });
  },
  get(id: string): Promise<IssueWithSeverity> {
    return api.get<IssueWithSeverity>(`/v1/issues/${id}`);
  },
  update(
    id: string,
    request: UpdateIssueRequestBody,
  ): Promise<IssueWithSeverity> {
    return api.post<IssueWithSeverity>(`/v1/issues/${id}`, request);
  },
  batchUpdate(request: BatchUpdateIssuesRequestBody): Promise<void> {
    return api.post<void>('/v1/issues/batch', request);
  },
  activities(id: string): Promise<IssueActivity[]> {
    return api.get<IssueActivity[]>(`/v1/issues/${id}/activities`);
  },
  addNote(id: string, text: string): Promise<IssueActivity> {
    return api.post<IssueActivity>(`/v1/issues/${id}/notes`, { text });
  },
  executions(
    id: string,
    request: { cursor?: string; limit?: number },
  ): Promise<SeekPage<Execution>> {
    return api.get<SeekPage<Execution>>(`/v1/issues/${id}/executions`, request);
  },
  workflows(id: string): Promise<string[]> {
    return api.get<string[]>(`/v1/issues/${id}/workflows`);
  },
  trend(id: string, granularity: IssueTrendGranularity): Promise<IssueTrend> {
    return api.get<IssueTrend>(`/v1/issues/${id}/trend`, {
      granularity,
      timezone: timezoneUtils.browser(),
    });
  },
  insight(id: string): Promise<IssueInsight> {
    return api.get<IssueInsight>(`/v1/issues/${id}/insight`);
  },
  alerts(id: string): Promise<AlertRecord[]> {
    return api.get<AlertRecord[]>(`/v1/issues/${id}/alerts`);
  },
  replayCheck(id: string): Promise<ReplayCheckResult> {
    return api.post<ReplayCheckResult>(`/v1/issues/${id}/replay-check`, {});
  },
  replay(
    id: string,
    request: IssueReplayRequestBody,
  ): Promise<IssueReplayResult> {
    return api.post<IssueReplayResult>(`/v1/issues/${id}/replay`, request);
  },
};
