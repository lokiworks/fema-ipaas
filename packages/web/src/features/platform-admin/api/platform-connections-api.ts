import { SeekPage } from '@fema/core-utils';
import {
  ListPlatformConnectionsRequestQuery,
  PlatformConnectionOwnersResponse,
  PlatformConnectionsListItem,
} from '@fema/shared';

import { api } from '@/lib/api';

export const platformConnectionsApi = {
  list(request: ListPlatformConnectionsRequestQuery) {
    return api.get<SeekPage<PlatformConnectionsListItem>>(
      '/v1/platform-connections',
      request,
    );
  },
  listOwners() {
    return api.get<PlatformConnectionOwnersResponse>(
      '/v1/platform-connections/owners',
    );
  },
};
