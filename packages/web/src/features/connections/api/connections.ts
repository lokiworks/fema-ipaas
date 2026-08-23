import { SeekPage } from '@fema/core-utils';
import {
  ConnectionOwners,
  ConnectionWithoutSensitiveData,
  GetOAuth2AuthorizationUrlRequestBody,
  GetOAuth2AuthorizationUrlResponse,
  ListConnectionOwnersRequestQuery,
  ListConnectionsRequestQuery,
  ReplaceConnectionsRequestBody,
  UpdateConnectionValueRequestBody,
  UpsertConnectionRequestBody,
} from '@fema/shared';

import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

export const connectionsApi = {
  list(
    request: ListConnectionsRequestQuery,
  ): Promise<SeekPage<ConnectionWithoutSensitiveData>> {
    return api.get<SeekPage<ConnectionWithoutSensitiveData>>(
      '/v1/connections',
      request,
    );
  },
  upsert(
    request: UpsertConnectionRequestBody,
  ): Promise<ConnectionWithoutSensitiveData> {
    return api.post<ConnectionWithoutSensitiveData>('/v1/connections', request);
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/connections/${id}`);
  },
  revalidate(id: string): Promise<ConnectionWithoutSensitiveData> {
    return api.post<ConnectionWithoutSensitiveData>(
      `/v1/connections/${id}/revalidate`,
      {},
    );
  },
  update(
    id: string,
    request: UpdateConnectionValueRequestBody,
  ): Promise<ConnectionWithoutSensitiveData> {
    return api.post<ConnectionWithoutSensitiveData>(
      `/v1/connections/${id}`,
      request,
    );
  },
  replace(request: ReplaceConnectionsRequestBody): Promise<void> {
    return api.post<void>(`/v1/connections/replace`, request);
  },
  getOwners(
    request: ListConnectionOwnersRequestQuery,
  ): Promise<SeekPage<ConnectionOwners>> {
    return api.get<SeekPage<ConnectionOwners>>(
      '/v1/connections/owners',
      request,
    );
  },
  getOAuth2AuthorizationUrl(
    request: Omit<GetOAuth2AuthorizationUrlRequestBody, 'projectId'> & {
      projectId?: string;
    },
  ): Promise<GetOAuth2AuthorizationUrlResponse> {
    const { projectId: projectIdOverride, ...rest } = request;
    const projectId = projectIdOverride ?? authenticationSession.getProjectId();
    return api.post<GetOAuth2AuthorizationUrlResponse>(
      '/v1/connections/oauth2/authorization-url',
      { ...rest, projectId },
    );
  },
};
