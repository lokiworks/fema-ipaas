import { SeekPage } from '@fema-ipaas/core-utils';
import {
  ListTenantConnectionsRequestQuery,
  TenantConnectionOwnersResponse,
  TenantConnectionsListItem,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const tenantConnectionsApi = {
  list(request: ListTenantConnectionsRequestQuery) {
    return api.get<SeekPage<TenantConnectionsListItem>>(
      '/v1/tenant-connections',
      request,
    );
  },
  listOwners() {
    return api.get<TenantConnectionOwnersResponse>(
      '/v1/tenant-connections/owners',
    );
  },
};
