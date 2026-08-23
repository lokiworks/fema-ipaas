import { ConnectionStatus } from '@fema/shared';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import {
  CURSOR_QUERY_PARAM,
  LIMIT_QUERY_PARAM,
} from '@/components/custom/data-table';

import { platformConnectionsApi } from '../api/platform-connections-api';

export const platformConnectionsKeys = {
  list: (searchParams: string) =>
    ['platform-connections', searchParams] as const,
  owners: () => ['platform-connections', 'owners'] as const,
};

export const platformConnectionsQueries = {
  useList: () => {
    const [searchParams] = useSearchParams();
    return useQuery({
      queryKey: platformConnectionsKeys.list(searchParams.toString()),
      staleTime: 0,
      gcTime: 0,
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
      queryFn: () => {
        const cursor = searchParams.get(CURSOR_QUERY_PARAM);
        const limit = searchParams.get(LIMIT_QUERY_PARAM);
        const status = searchParams.getAll('status') as ConnectionStatus[];
        const projectIds = searchParams.getAll('projectIds');
        const ownerIds = searchParams.getAll('ownerIds');
        return platformConnectionsApi.list({
          cursor: cursor ?? undefined,
          limit: limit ? parseInt(limit) : undefined,
          displayName: searchParams.get('displayName') ?? undefined,
          connectorName: searchParams.get('connectorName') ?? undefined,
          status: status.length > 0 ? status : undefined,
          projectIds: projectIds.length > 0 ? projectIds : undefined,
          ownerIds: ownerIds.length > 0 ? ownerIds : undefined,
        });
      },
    });
  },
  useOwners: () =>
    useQuery({
      queryKey: platformConnectionsKeys.owners(),
      queryFn: () => platformConnectionsApi.listOwners(),
    }),
};
