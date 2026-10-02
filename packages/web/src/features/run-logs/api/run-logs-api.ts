import { SeekPage } from '@fema-ipaas/core-utils';
import {
  ListRunLogsRequestQuery,
  RerunRunLogsRequestBody,
  RerunRunLogsResponse,
  RunLogDetail,
  RunLogRow,
  RunLogScope,
  TerminateRunLogRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';
import { timezoneUtils } from '@/lib/timezone-utils';

export const runLogsApi = {
  list(query: ListRunLogsRequestQuery): Promise<SeekPage<RunLogRow>> {
    return api.get<SeekPage<RunLogRow>>('/v1/run-logs', {
      ...query,
      timezone: timezoneUtils.browser(),
    });
  },
  scope(): Promise<RunLogScope> {
    return api.get<RunLogScope>('/v1/run-logs/scope');
  },
  detail(id: string): Promise<RunLogDetail> {
    return api.get<RunLogDetail>(`/v1/run-logs/${id}`);
  },
  rerun(request: RerunRunLogsRequestBody): Promise<RerunRunLogsResponse> {
    return api.post<RerunRunLogsResponse>('/v1/run-logs/rerun', request);
  },
  terminate({
    id,
    request,
  }: {
    id: string;
    request: TerminateRunLogRequestBody;
  }): Promise<void> {
    return api.post<void>(`/v1/run-logs/${id}/terminate`, request);
  },
};
