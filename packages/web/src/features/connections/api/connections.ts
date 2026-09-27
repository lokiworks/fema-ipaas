import { SeekPage } from '@fema-ipaas/core-utils';
import {
  AccessibleConnection,
  AddConnectionSharesRequestBody,
  ConnectionDetail,
  ConnectionOwners,
  ConnectionScopeImpact,
  ConnectionScopeImpactRequestBody,
  ConnectionShare,
  ConnectionWithoutSensitiveData,
  GetOAuth2AuthorizationUrlRequestBody,
  GetOAuth2AuthorizationUrlResponse,
  ListAccessibleConnectionsRequestQuery,
  ListConnectionOwnersRequestQuery,
  ListConnectionsRequestQuery,
  ReplaceConnectionsRequestBody,
  UpdateConnectionAccessRequestBody,
  UpdateConnectionShareRequestBody,
  UpdateConnectionValueRequestBody,
  UpsertConnectionRequestBody,
} from '@fema-ipaas/shared';

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
  listAccessible(
    request: ListAccessibleConnectionsRequestQuery,
  ): Promise<SeekPage<AccessibleConnection>> {
    return api.get<SeekPage<AccessibleConnection>>(
      '/v1/connections/accessible',
      request,
    );
  },
  getDetail(id: string): Promise<ConnectionDetail> {
    return api.get<ConnectionDetail>(`/v1/connections/${id}/detail`);
  },
  addShares(
    id: string,
    request: AddConnectionSharesRequestBody,
  ): Promise<ConnectionShare[]> {
    return api.post<ConnectionShare[]>(`/v1/connections/${id}/shares`, request);
  },
  updateShare(
    id: string,
    userId: string,
    request: UpdateConnectionShareRequestBody,
  ): Promise<ConnectionShare[]> {
    return api.post<ConnectionShare[]>(
      `/v1/connections/${id}/shares/${userId}`,
      request,
    );
  },
  removeShare(id: string, userId: string): Promise<ConnectionShare[]> {
    return api.delete<ConnectionShare[]>(
      `/v1/connections/${id}/shares/${userId}`,
    );
  },
  getAccessImpact(
    id: string,
    request: ConnectionScopeImpactRequestBody,
  ): Promise<ConnectionScopeImpact> {
    return api.post<ConnectionScopeImpact>(
      `/v1/connections/${id}/access-impact`,
      request,
    );
  },
  updateAccess(
    id: string,
    request: UpdateConnectionAccessRequestBody,
  ): Promise<ConnectionDetail> {
    return api.post<ConnectionDetail>(`/v1/connections/${id}/access`, request);
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
