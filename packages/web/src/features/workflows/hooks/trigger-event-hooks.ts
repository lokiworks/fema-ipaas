import { SeekPage } from '@fema-ipaas/core-utils';
import { TriggerEventWithPayload } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';

import { authenticationSession } from '@/lib/authentication-session';

import { triggerEventsApi } from '../api/trigger-events-api';

export const triggerEventHooks = {
  usePollResults: (workflowVersionId: string, workflowId: string) => {
    const { data: pollResults, refetch } = useQuery<
      SeekPage<TriggerEventWithPayload>
    >({
      queryKey: ['triggerEvents', workflowVersionId],
      queryFn: () =>
        triggerEventsApi.list({
          workspaceId: authenticationSession.getWorkspaceId()!,
          workflowId: workflowId,
          limit: 5,
          cursor: undefined,
        }),
      staleTime: 0,
    });
    return { pollResults, refetch };
  },
};
