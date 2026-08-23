import { ConnectionStatus } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import {
  CURSOR_QUERY_PARAM,
  LIMIT_QUERY_PARAM,
} from '@/components/custom/data-table';

import { tenantConnectionsApi } from '../api/tenant-connections-api';

export const tenantConnectionsKeys = {
  list: (searchParams: string) => ['tenant-connections', searchParams] as const,
  owners: () => ['tenant-connections', 'owners'] as const,
};

export const tenantConnectionsQueries = {
  useList: () => {
    const [searchParams] = useSearchParams();
    return useQuery({
      queryKey: tenantConnectionsKeys.list(searchParams.toString()),
      staleTime: 0,
      gcTime: 0,
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
      queryFn: () => {
        const cursor = searchParams.get(CURSOR_QUERY_PARAM);
        const limit = searchParams.get(LIMIT_QUERY_PARAM);
        const status = searchParams.getAll('status') as ConnectionStatus[];
        const workspaceIds = searchParams.getAll('workspaceIds');
        const ownerIds = searchParams.getAll('ownerIds');
        return tenantConnectionsApi.list({
          cursor: cursor ?? undefined,
          limit: limit ? parseInt(limit) : undefined,
          displayName: searchParams.get('displayName') ?? undefined,
          connectorName: searchParams.get('connectorName') ?? undefined,
          status: status.length > 0 ? status : undefined,
          workspaceIds: workspaceIds.length > 0 ? workspaceIds : undefined,
          ownerIds: ownerIds.length > 0 ? ownerIds : undefined,
        });
      },
    });
  },
  useOwners: () =>
    useQuery({
      queryKey: tenantConnectionsKeys.owners(),
      queryFn: () => tenantConnectionsApi.listOwners(),
    }),
};
