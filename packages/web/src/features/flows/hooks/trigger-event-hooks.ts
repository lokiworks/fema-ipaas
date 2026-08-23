import { SeekPage } from '@fema/core-utils';
import { TriggerEventWithPayload } from '@fema/shared';
import { useQuery } from '@tanstack/react-query';

import { authenticationSession } from '@/lib/authentication-session';

import { triggerEventsApi } from '../api/trigger-events-api';

export const triggerEventHooks = {
  usePollResults: (flowVersionId: string, flowId: string) => {
    const { data: pollResults, refetch } = useQuery<
      SeekPage<TriggerEventWithPayload>
    >({
      queryKey: ['triggerEvents', flowVersionId],
      queryFn: () =>
        triggerEventsApi.list({
          workspaceId: authenticationSession.getWorkspaceId()!,
          flowId: flowId,
          limit: 5,
          cursor: undefined,
        }),
      staleTime: 0,
    });
    return { pollResults, refetch };
  },
};
