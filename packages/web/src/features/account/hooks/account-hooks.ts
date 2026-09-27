import {
  CreatePersonalAccessTokenRequestBody,
  NotificationPreferences,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userHooks } from '@/hooks/user-hooks';

import { accountApi } from '../api/account-api';

export const accountKeys = {
  preferences: ['account', 'notification-preferences'],
  tokens: ['account', 'access-tokens'],
};

export const accountHooks = {
  useNotificationPreferences: () => {
    return useQuery({
      queryKey: accountKeys.preferences,
      queryFn: () => accountApi.getNotificationPreferences(),
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    });
  },
  useUpdateNotificationPreferences: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (request: NotificationPreferences) =>
        accountApi.updateNotificationPreferences(request),
      onSuccess: (data) =>
        queryClient.setQueryData(accountKeys.preferences, data),
    });
  },
  useTokens: () => {
    return useQuery({
      queryKey: accountKeys.tokens,
      queryFn: () => accountApi.listTokens(),
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    });
  },
  useCreateToken: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (request: CreatePersonalAccessTokenRequestBody) =>
        accountApi.createToken(request),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: accountKeys.tokens }),
    });
  },
  useRevokeToken: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => accountApi.revokeToken(id),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: accountKeys.tokens }),
    });
  },
  useUpdateProfile: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (name: string) => accountApi.updateProfile({ name }),
      onSuccess: () => userHooks.invalidateCurrentUser(queryClient),
    });
  },
};
