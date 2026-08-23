import { SeekPage } from '@fema-ipaas/core-utils';
import {
  ConnectionWithoutSensitiveData,
  ListGlobalConnectionsRequestQuery,
  UpdateGlobalConnectionValueRequestBody,
  UpsertGlobalConnectionRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const globalConnectionsApi = {
  list(
    request: ListGlobalConnectionsRequestQuery,
  ): Promise<SeekPage<ConnectionWithoutSensitiveData>> {
    return api.get<SeekPage<ConnectionWithoutSensitiveData>>(
      '/v1/global-connections',
      request,
    );
  },
  upsert(
    request: UpsertGlobalConnectionRequestBody,
  ): Promise<ConnectionWithoutSensitiveData> {
    return api.post<ConnectionWithoutSensitiveData>(
      '/v1/global-connections',
      request,
    );
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/global-connections/${id}`);
  },
  update(
    id: string,
    request: UpdateGlobalConnectionValueRequestBody,
  ): Promise<ConnectionWithoutSensitiveData> {
    return api.post<ConnectionWithoutSensitiveData>(
      `/v1/global-connections/${id}`,
      request,
    );
  },
};
