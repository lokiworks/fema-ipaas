import {
  AccountSecurityStatus,
  ConfirmPhoneBindingRequest,
  MfaDisableRequest,
  RequestPhoneBindingRequest,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authenticationApi } from '@/api/authentication-api';
import { HttpError } from '@/lib/api';

const SECURITY_KEY = ['account', 'security'];

function useSecurityStatus() {
  return useQuery<AccountSecurityStatus, HttpError>({
    queryKey: SECURITY_KEY,
    queryFn: () => authenticationApi.securityStatus(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useRefreshSecurityStatus() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SECURITY_KEY });
}

function useRequestPhoneBinding() {
  return useMutation<void, HttpError, RequestPhoneBindingRequest>({
    mutationFn: authenticationApi.requestPhoneBinding,
  });
}

function useConfirmPhoneBinding() {
  const refresh = useRefreshSecurityStatus();
  return useMutation<void, HttpError, ConfirmPhoneBindingRequest>({
    mutationFn: authenticationApi.confirmPhoneBinding,
    onSuccess: refresh,
  });
}

function useDisableMfa() {
  const refresh = useRefreshSecurityStatus();
  return useMutation<void, HttpError, MfaDisableRequest>({
    mutationFn: authenticationApi.disableMfa,
    onSuccess: refresh,
  });
}

function useRegenerateRecoveryCodes() {
  const refresh = useRefreshSecurityStatus();
  return useMutation<{ recoveryCodes: string[] }, HttpError, void>({
    mutationFn: () => authenticationApi.regenerateRecoveryCodes(),
    onSuccess: refresh,
  });
}

export const accountSecurityHooks = {
  useSecurityStatus,
  useRefreshSecurityStatus,
  useRequestPhoneBinding,
  useConfirmPhoneBinding,
  useDisableMfa,
  useRegenerateRecoveryCodes,
};
