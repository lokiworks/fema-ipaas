import { SeekPage } from '@fema-ipaas/core-utils';
import {
  DedupedEventStats,
  DedupedEventWithWorkflow,
  HolidayCalendar,
  ListDedupedEventsRequestQuery,
  UpdateHolidayCalendarRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const triggerRuntimeApi = {
  listDedupedEvents(
    request: ListDedupedEventsRequestQuery,
  ): Promise<SeekPage<DedupedEventWithWorkflow>> {
    return api.get<SeekPage<DedupedEventWithWorkflow>>(
      '/v1/deduped-events',
      request,
    );
  },
  dedupedEventStats({
    projectId,
    workflowId,
  }: {
    projectId: string;
    workflowId: string;
  }): Promise<DedupedEventStats> {
    return api.get<DedupedEventStats>('/v1/deduped-events/stats', {
      projectId,
      workflowId,
    });
  },
  getHolidayCalendar(): Promise<HolidayCalendar> {
    return api.get<HolidayCalendar>('/v1/holiday-calendar');
  },
  updateHolidayCalendar(
    request: UpdateHolidayCalendarRequestBody,
  ): Promise<HolidayCalendar> {
    return api.post<HolidayCalendar>('/v1/holiday-calendar', request);
  },
};
