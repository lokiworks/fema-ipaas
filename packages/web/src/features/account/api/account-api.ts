import {
  CreatePersonalAccessTokenRequestBody,
  CreatePersonalAccessTokenResponse,
  NotificationPreferences,
  PersonalAccessToken,
  UpdateProfileRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const accountApi = {
  updateProfile(request: UpdateProfileRequestBody): Promise<void> {
    return api.post<void>('/v1/account/profile', request);
  },
  getNotificationPreferences(): Promise<NotificationPreferences> {
    return api.get<NotificationPreferences>(
      '/v1/account/notification-preferences',
    );
  },
  updateNotificationPreferences(
    request: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    return api.post<NotificationPreferences>(
      '/v1/account/notification-preferences',
      request,
    );
  },
  listTokens(): Promise<PersonalAccessToken[]> {
    return api.get<PersonalAccessToken[]>('/v1/account/access-tokens');
  },
  createToken(
    request: CreatePersonalAccessTokenRequestBody,
  ): Promise<CreatePersonalAccessTokenResponse> {
    return api.post<CreatePersonalAccessTokenResponse>(
      '/v1/account/access-tokens',
      request,
    );
  },
  revokeToken(id: string): Promise<void> {
    return api.delete<void>(`/v1/account/access-tokens/${id}`);
  },
};
