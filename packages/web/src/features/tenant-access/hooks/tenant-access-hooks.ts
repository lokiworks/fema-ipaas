import {
  AddTenantUsersRequestBody,
  ListOwnedResourcesRequestQuery,
  ModuleAccessRequestStatus,
  TransferResourcesRequestBody,
  UpdateLoginSecurityRequestBody,
  UpdateModuleAccessSettingsRequestBody,
  UpdateTenantMemberAccessRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { useIsTenantAdmin } from '@/hooks/authorization-hooks';
import { api } from '@/lib/api';

import { tenantAccessApi } from '../api/tenant-access-api';

function showError(error: unknown): void {
  toast.error(api.extractServerErrorMessage(error, t('Something went wrong')));
}

function useMembers() {
  return useQuery({
    queryKey: tenantAccessKeys.members,
    queryFn: () => tenantAccessApi.listMembers(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useInviteMembers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AddTenantUsersRequestBody) =>
      tenantAccessApi.inviteMembers(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.members });
    },
    onError: showError,
  });
}

function useUpdateAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      request,
    }: {
      userId: string;
      request: UpdateTenantMemberAccessRequestBody;
    }) => tenantAccessApi.updateAccess({ userId, request }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.members });
      toast.success(t('Saved. The new permissions apply right away.'));
    },
    onError: showError,
  });
}

function useSetEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, enabled }: { userId: string; enabled: boolean }) =>
      tenantAccessApi.setEnabled({ userId, enabled }),
    onSuccess: (_member, variables) => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.members });
      toast.success(
        variables.enabled ? t('User enabled') : t('User disabled'),
      );
    },
    onError: showError,
  });
}

function useResetPassword() {
  return useMutation({
    mutationFn: (userId: string) => tenantAccessApi.resetPassword(userId),
    onError: showError,
  });
}

function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      transferToUserId,
    }: {
      userId: string;
      transferToUserId: string | null;
    }) => tenantAccessApi.removeMember({ userId, transferToUserId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.members });
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.resourcesRoot });
      toast.success(t('User removed'));
    },
    onError: showError,
  });
}

function useResources(query: ListOwnedResourcesRequestQuery) {
  return useQuery({
    queryKey: [...tenantAccessKeys.resourcesRoot, query],
    queryFn: () => tenantAccessApi.listResources(query),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useOwnedBy(ownerId: string | null) {
  return useQuery({
    queryKey: [...tenantAccessKeys.resourcesRoot, 'owner', ownerId],
    queryFn: () =>
      tenantAccessApi.listResources({ ownerId: ownerId ?? undefined }),
    enabled: ownerId !== null,
  });
}

function useTransferResources() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: TransferResourcesRequestBody) =>
      tenantAccessApi.transferResources(request),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.resourcesRoot });
      toast.success(
        t('transferredResourcesCount', { count: result.transferred }),
      );
    },
    onError: showError,
  });
}

function useModuleSettings() {
  return useQuery({
    queryKey: tenantAccessKeys.moduleSettings,
    queryFn: () => tenantAccessApi.getModuleSettings(),
  });
}

function useUpdateModuleSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateModuleAccessSettingsRequestBody) =>
      tenantAccessApi.updateModuleSettings(request),
    onSuccess: (settings) => {
      queryClient.setQueryData(tenantAccessKeys.moduleSettings, settings);
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.me });
      toast.success(t('Saved'));
    },
    onError: showError,
  });
}

function useRequests(status: ModuleAccessRequestStatus | undefined) {
  return useQuery({
    queryKey: [...tenantAccessKeys.requestsRoot, status ?? 'all'],
    queryFn: () => tenantAccessApi.listRequests(status),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function usePendingRequestCount() {
  const isAdmin = useIsTenantAdmin();
  const { data } = useQuery({
    queryKey: [...tenantAccessKeys.requestsRoot, ModuleAccessRequestStatus.PENDING],
    queryFn: () =>
      tenantAccessApi.listRequests(ModuleAccessRequestStatus.PENDING),
    enabled: isAdmin,
  });
  return data?.length ?? 0;
}

function useDecideRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      tenantAccessApi.decideRequest({ id, approve }),
    onSuccess: (_request, variables) => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.requestsRoot });
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.members });
      toast.success(
        variables.approve ? t('Request approved') : t('Request rejected'),
      );
    },
    onError: showError,
  });
}

function useLoginSecurity() {
  return useQuery({
    queryKey: tenantAccessKeys.loginSecurity,
    queryFn: () => tenantAccessApi.getLoginSecurity(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useUpdateLoginSecurity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateLoginSecurityRequestBody) =>
      tenantAccessApi.updateLoginSecurity(request),
    onSuccess: (settings) => {
      queryClient.setQueryData(tenantAccessKeys.loginSecurity, settings);
      toast.success(t('Saved'));
    },
    onError: showError,
  });
}

function useMyAccess() {
  return useQuery({
    queryKey: tenantAccessKeys.me,
    queryFn: () => tenantAccessApi.getMyAccess(),
    staleTime: 60 * 1000,
  });
}

function useRequestModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: tenantAccessApi.requestModule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.me });
      toast.success(t('Request sent. An admin will review it.'));
    },
    onError: showError,
  });
}

function useWorkerFleet() {
  return useQuery({
    queryKey: tenantAccessKeys.workerFleet,
    queryFn: () => tenantAccessApi.getWorkerFleet(),
    refetchInterval: 5000,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useWorkerAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: 'drain' | 'resume' | 'remove';
    }) => {
      if (action === 'drain') {
        await tenantAccessApi.drainWorker(id);
      } else if (action === 'resume') {
        await tenantAccessApi.resumeWorker(id);
      } else {
        await tenantAccessApi.removeWorker(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.workerFleet });
    },
    onError: showError,
  });
}

function useComponentHealth() {
  return useQuery({
    queryKey: tenantAccessKeys.componentHealth,
    queryFn: () => tenantAccessApi.getComponentHealth(),
    refetchInterval: 30 * 1000,
  });
}

function useConfirmBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tenantAccessApi.confirmBackup(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: tenantAccessKeys.componentHealth,
      });
      toast.success(t('Backup recorded'));
    },
    onError: showError,
  });
}

function useEncryptionStatus() {
  return useQuery({
    queryKey: tenantAccessKeys.encryption,
    queryFn: () => tenantAccessApi.getEncryptionStatus(),
  });
}

export const tenantAccessKeys = {
  members: ['tenant-access', 'members'],
  resourcesRoot: ['tenant-access', 'resources'],
  moduleSettings: ['tenant-access', 'module-settings'],
  requestsRoot: ['tenant-access', 'requests'],
  loginSecurity: ['tenant-access', 'login-security'],
  me: ['tenant-access', 'me'],
  workerFleet: ['tenant-access', 'worker-fleet'],
  componentHealth: ['tenant-access', 'component-health'],
  encryption: ['tenant-access', 'encryption'],
};

export const tenantAccessHooks = {
  useMembers,
  useInviteMembers,
  useUpdateAccess,
  useSetEnabled,
  useResetPassword,
  useRemoveMember,
  useResources,
  useOwnedBy,
  useTransferResources,
  useModuleSettings,
  useUpdateModuleSettings,
  useRequests,
  usePendingRequestCount,
  useDecideRequest,
  useLoginSecurity,
  useUpdateLoginSecurity,
  useMyAccess,
  useRequestModule,
  useWorkerFleet,
  useWorkerAction,
  useComponentHealth,
  useConfirmBackup,
  useEncryptionStatus,
};
