import {
  CreatePlatformClientRequestBody,
  GrantInstanceOperatorRequestBody,
  ListOperatorTenantsRequestQuery,
  OperatorCreateTenantRequestBody,
  PlatformLoginAppKind,
  TenantLimitsUpdate,
  UpdateInstanceSettingsRequestBody,
  UpdatePlatformLoginAppRequestBody,
  UpdateSmsSettingsRequestBody,
  UpdateTenantSlugRequestBody,
  TestSmsSettingsRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { userHooks } from '@/hooks/user-hooks';
import { api } from '@/lib/api';

import { operatorApi } from '../api/operator-api';
import { operatorUtils } from '../utils/operator-utils';

function showError(error: unknown): void {
  toast.error(api.extractServerErrorMessage(error, t('Something went wrong')));
}

function useIsOperator(): boolean {
  const { data: user } = userHooks.useCurrentUser();
  return operatorUtils.isOperator(user ?? null);
}

function useTenants(query: ListOperatorTenantsRequestQuery) {
  return useQuery({
    queryKey: [...operatorKeys.tenants, query],
    queryFn: () => operatorApi.listTenants(query),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useTenant(id: string) {
  return useQuery({
    queryKey: operatorKeys.tenant(id),
    queryFn: () => operatorApi.getTenant(id),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: OperatorCreateTenantRequestBody) =>
      operatorApi.createTenant(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.tenants });
    },
    onError: showError,
  });
}

function useTenantLifecycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'suspend' | 'resume';
    }) =>
      action === 'suspend'
        ? operatorApi.suspendTenant(id)
        : operatorApi.resumeTenant(id),
    onSuccess: (tenant) => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.tenants });
      queryClient.setQueryData(operatorKeys.tenant(tenant.id), tenant);
    },
    onError: showError,
  });
}

function useUpdateLimits({ onSaved }: { onSaved?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: TenantLimitsUpdate;
    }) => operatorApi.updateLimits({ id, request }),
    onSuccess: (tenant) => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.tenants });
      queryClient.setQueryData(operatorKeys.tenant(tenant.id), tenant);
      toast.success(t('Limits saved'));
      onSaved?.();
    },
    onError: showError,
  });
}

function useUpdateTenantSlug({ onSaved }: { onSaved?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: UpdateTenantSlugRequestBody;
    }) => operatorApi.updateSlug({ id, request }),
    onSuccess: (tenant) => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.tenants });
      queryClient.setQueryData(operatorKeys.tenant(tenant.id), tenant);
      toast.success(t('Sign-in address updated'));
      onSaved?.();
    },
    onError: showError,
  });
}

function useOperators() {
  return useQuery({
    queryKey: operatorKeys.operators,
    queryFn: () => operatorApi.listOperators(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useGrantOperator({ onGranted }: { onGranted?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: GrantInstanceOperatorRequestBody) =>
      operatorApi.grantOperator(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.operators });
      onGranted?.();
    },
    onError: showError,
  });
}

function useRevokeOperator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (identityId: string) => operatorApi.revokeOperator(identityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.operators });
    },
    onError: showError,
  });
}

function useSettings() {
  return useQuery({
    queryKey: operatorKeys.settings,
    queryFn: () => operatorApi.getSettings(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateInstanceSettingsRequestBody) =>
      operatorApi.updateSettings(request),
    onSuccess: (settings) => {
      queryClient.setQueryData(operatorKeys.settings, settings);
      queryClient.invalidateQueries({ queryKey: ['flags'] });
      toast.success(t('Saved'));
    },
    onError: showError,
  });
}

function useSaveSms({ onSaved }: { onSaved?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateSmsSettingsRequestBody) =>
      operatorApi.saveSmsSettings(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.settings });
      queryClient.invalidateQueries({ queryKey: ['flags'] });
      toast.success(t('Saved'));
      onSaved?.();
    },
    onError: showError,
  });
}

function useTestSms() {
  return useMutation({
    mutationFn: (request: TestSmsSettingsRequestBody) =>
      operatorApi.testSmsSettings(request),
    onSuccess: () => {
      toast.success(t('Test message sent'));
    },
    onError: showError,
  });
}

function useSavePlatformLoginApp({ onSaved }: { onSaved?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      request,
    }: {
      kind: PlatformLoginAppKind;
      request: UpdatePlatformLoginAppRequestBody;
    }) => operatorApi.savePlatformLoginApp({ kind, request }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.settings });
      queryClient.invalidateQueries({ queryKey: ['flags'] });
      toast.success(t('Saved'));
      onSaved?.();
    },
    onError: showError,
  });
}

function usePlatformClients() {
  return useQuery({
    queryKey: operatorKeys.platformClients,
    queryFn: () => operatorApi.listPlatformClients(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useCreatePlatformClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreatePlatformClientRequestBody) =>
      operatorApi.createPlatformClient(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.platformClients });
    },
    onError: showError,
  });
}

function useRevokePlatformClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => operatorApi.revokePlatformClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operatorKeys.platformClients });
    },
    onError: showError,
  });
}

export const operatorKeys = {
  tenants: ['operator', 'tenants'],
  tenant: (id: string) => ['operator', 'tenant', id],
  operators: ['operator', 'operators'],
  settings: ['operator', 'settings'],
  platformClients: ['operator', 'platform-clients'],
};

export const operatorHooks = {
  useIsOperator,
  useTenants,
  useTenant,
  useCreateTenant,
  useTenantLifecycle,
  useUpdateLimits,
  useUpdateTenantSlug,
  useOperators,
  useGrantOperator,
  useRevokeOperator,
  useSettings,
  useUpdateSettings,
  useSaveSms,
  useTestSms,
  useSavePlatformLoginApp,
  usePlatformClients,
  useCreatePlatformClient,
  useRevokePlatformClient,
};
