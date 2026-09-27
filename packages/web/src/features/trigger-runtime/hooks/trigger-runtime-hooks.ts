import { ListDedupedEventsRequestQuery } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { triggerRuntimeApi } from '../api/trigger-runtime-api';

function useDedupedEvents(request: ListDedupedEventsRequestQuery) {
  return useQuery({
    queryKey: [TRIGGER_RUNTIME_KEY, 'deduped-events', request],
    queryFn: () => triggerRuntimeApi.listDedupedEvents(request),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useDedupedEventStats({
  projectId,
  workflowId,
  enabled,
}: {
  projectId: string | undefined;
  workflowId: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: [TRIGGER_RUNTIME_KEY, 'deduped-stats', projectId, workflowId],
    queryFn: () =>
      triggerRuntimeApi.dedupedEventStats({
        projectId: projectId ?? '',
        workflowId,
      }),
    enabled: enabled && !!projectId,
  });
}

function useHolidayCalendar() {
  return useQuery({
    queryKey: [TRIGGER_RUNTIME_KEY, 'holiday-calendar'],
    queryFn: () => triggerRuntimeApi.getHolidayCalendar(),
  });
}

function useUpdateHolidayCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dates: string[]) =>
      triggerRuntimeApi.updateHolidayCalendar({ dates }),
    onSuccess: (calendar) => {
      queryClient.setQueryData(
        [TRIGGER_RUNTIME_KEY, 'holiday-calendar'],
        calendar,
      );
      toast.success(t('Holiday calendar saved'));
    },
  });
}

export const triggerRuntimeHooks = {
  useDedupedEvents,
  useDedupedEventStats,
  useHolidayCalendar,
  useUpdateHolidayCalendar,
};

const TRIGGER_RUNTIME_KEY = 'trigger-runtime';
