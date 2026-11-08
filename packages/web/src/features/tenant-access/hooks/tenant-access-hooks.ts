import {
  AddDirectoryMembersRequestBody,
  AddTenantUsersRequestBody,
  ListOwnedResourcesRequestQuery,
  ModuleAccessRequestStatus,
  SsoProvider,
  SsoSettings,
  TransferResourcesRequestBody,
  UpdateDingtalkSsoRequestBody,
  UpdateFeishuSsoRequestBody,
  UpdateLoginSecurityRequestBody,
  UpdateOidcSsoRequestBody,
  UpdateSamlSsoRequestBody,
  UpdateTenantMfaPolicyRequestBody,
  UpdateTenantSlugRequestBody,
  UpdateWecomSsoRequestBody,
  CreateTenantDomainRequestBody,
  PlatformAppBindingView,
  UpdateModuleAccessSettingsRequestBody,
  UpdateTenantMemberAccessRequestBody,
} from '@fema-ipaas/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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

function useDirectory({
  keyword,
  page,
  enabled,
}: {
  keyword: string;
  page: number;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: [...tenantAccessKeys.directory, keyword, page],
    queryFn: () =>
      tenantAccessApi.listDirectory({
        keyword: keyword.length > 0 ? keyword : undefined,
        page,
        limit: DIRECTORY_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

function useAddFromDirectory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AddDirectoryMembersRequestBody) =>
      tenantAccessApi.addFromDirectory(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.members });
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.directory });
    },
    onError: showError,
  });
}

function useRemovePendingBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bindingId: string) =>
      tenantAccessApi.removePendingBinding(bindingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.members });
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.directory });
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
      toast.success(variables.enabled ? t('User enabled') : t('User disabled'));
    },
    onError: showError,
  });
}

function useBulkSetEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userIds,
      enabled,
    }: {
      userIds: string[];
      enabled: boolean;
    }) => {
      const results = await Promise.allSettled(
        userIds.map((userId) =>
          tenantAccessApi.setEnabled({ userId, enabled }),
        ),
      );
      const done = results.filter(
        (result) => result.status === 'fulfilled',
      ).length;
      return { done, failed: results.length - done, enabled };
    },
    onSuccess: ({ done, failed, enabled }) => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.members });
      if (done > 0) {
        toast.success(
          enabled
            ? t('Enabled {count} users', { count: done })
            : t('Disabled {count} users', { count: done }),
        );
      }
      if (failed > 0) {
        toast.error(t('{count} users could not be changed', { count: failed }));
      }
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
      queryClient.invalidateQueries({
        queryKey: tenantAccessKeys.resourcesRoot,
      });
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
      queryClient.invalidateQueries({
        queryKey: tenantAccessKeys.resourcesRoot,
      });
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
    queryKey: [
      ...tenantAccessKeys.requestsRoot,
      ModuleAccessRequestStatus.PENDING,
    ],
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
      queryClient.invalidateQueries({
        queryKey: tenantAccessKeys.requestsRoot,
      });
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

function useSsoSettings() {
  return useQuery({
    queryKey: tenantAccessKeys.sso,
    queryFn: () => tenantAccessApi.getSsoSettings(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useSaveOidcSso({ onSaved }: { onSaved?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateOidcSsoRequestBody) =>
      tenantAccessApi.saveOidcSso(request),
    onSuccess: (settings) => {
      queryClient.setQueryData(tenantAccessKeys.sso, settings);
      queryClient.invalidateQueries({
        queryKey: tenantAccessKeys.loginSecurity,
      });
      toast.success(t('Saved'));
      onSaved?.();
    },
    onError: showError,
  });
}

function useSaveFeishuSso({ onSaved }: { onSaved?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateFeishuSsoRequestBody) =>
      tenantAccessApi.saveFeishuSso(request),
    onSuccess: (settings) => {
      queryClient.setQueryData(tenantAccessKeys.sso, settings);
      queryClient.invalidateQueries({
        queryKey: tenantAccessKeys.loginSecurity,
      });
      toast.success(t('Saved'));
      onSaved?.();
    },
    onError: showError,
  });
}

function useSsoSaver<TRequest>({
  save,
  onSaved,
}: {
  save: (request: TRequest) => Promise<SsoSettings>;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: save,
    onSuccess: (settings) => {
      queryClient.setQueryData(tenantAccessKeys.sso, settings);
      queryClient.invalidateQueries({
        queryKey: tenantAccessKeys.loginSecurity,
      });
      toast.success(t('Saved'));
      onSaved?.();
    },
    onError: showError,
  });
}

function useSaveWecomSso({ onSaved }: { onSaved?: () => void } = {}) {
  return useSsoSaver<UpdateWecomSsoRequestBody>({
    save: tenantAccessApi.saveWecomSso,
    onSaved,
  });
}

function useSaveDingtalkSso({ onSaved }: { onSaved?: () => void } = {}) {
  return useSsoSaver<UpdateDingtalkSsoRequestBody>({
    save: tenantAccessApi.saveDingtalkSso,
    onSaved,
  });
}

function useSaveSamlSso({ onSaved }: { onSaved?: () => void } = {}) {
  return useSsoSaver<UpdateSamlSsoRequestBody>({
    save: tenantAccessApi.saveSamlSso,
    onSaved,
  });
}

function useStartPlatformBinding() {
  return useMutation({
    mutationFn: (kind: PlatformAppBindingView['kind']) =>
      tenantAccessApi.startPlatformBinding(kind),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: showError,
  });
}

function useRemovePlatformBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: PlatformAppBindingView['kind']) =>
      tenantAccessApi.removePlatformBinding(kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.sso });
      queryClient.invalidateQueries({
        queryKey: tenantAccessKeys.loginSecurity,
      });
      toast.success(t('Binding removed'));
    },
    onError: showError,
  });
}

function useUpdateMfaPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateTenantMfaPolicyRequestBody) =>
      tenantAccessApi.updateMfaPolicy(request),
    onSuccess: (settings) => {
      queryClient.setQueryData(tenantAccessKeys.loginSecurity, settings);
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      toast.success(t('Saved'));
    },
    onError: showError,
  });
}

function useDomains() {
  return useQuery({
    queryKey: tenantAccessKeys.domains,
    queryFn: () => tenantAccessApi.listDomains(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useCreateDomain({
  onCreated,
  onError,
}: {
  onCreated?: () => void;
  onError?: (error: unknown) => void;
} = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateTenantDomainRequestBody) =>
      tenantAccessApi.createDomain(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.domains });
      onCreated?.();
    },
    onError: onError ?? showError,
  });
}

function useVerifyDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tenantAccessApi.verifyDomain(id),
    onSuccess: (domain) => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.domains });
      if (domain.verifiedAt) {
        toast.success(t('Domain verified'));
      } else {
        toast.error(
          t(
            'The TXT record was not found yet. DNS changes can take a few minutes.',
          ),
        );
      }
    },
    onError: showError,
  });
}

function useRemoveDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tenantAccessApi.removeDomain(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantAccessKeys.domains });
    },
    onError: showError,
  });
}

function useUpdateSlug({
  onSaved,
  onError,
}: {
  onSaved?: () => void;
  onError?: (error: unknown) => void;
} = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tenantId,
      request,
    }: {
      tenantId: string;
      request: UpdateTenantSlugRequestBody;
    }) => tenantAccessApi.updateSlug({ tenantId, request }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      toast.success(t('Sign-in address updated'));
      onSaved?.();
    },
    onError: onError ?? showError,
  });
}

function useSetSsoEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: SsoProvider; enabled: boolean }) =>
      tenantAccessApi.setSsoEnabled(params),
    onSuccess: (settings) => {
      queryClient.setQueryData(tenantAccessKeys.sso, settings);
      queryClient.invalidateQueries({
        queryKey: tenantAccessKeys.loginSecurity,
      });
      toast.success(t('Saved'));
    },
    onError: showError,
  });
}

function useStartSsoTest() {
  return useMutation({
    mutationFn: (provider: SsoProvider) =>
      tenantAccessApi.startSsoTest(provider),
    onSuccess: ({ url }) => {
      window.location.assign(url);
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
    refetchInterval: (query) =>
      (query.state.data?.checks ?? []).some(
        (check) => check.facts.pending === true,
      )
        ? 3 * 1000
        : 30 * 1000,
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
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

const DIRECTORY_PAGE_SIZE = 20;

export const tenantAccessKeys = {
  members: ['tenant-access', 'members'],
  directory: ['tenant-access', 'members', 'directory'],
  resourcesRoot: ['tenant-access', 'resources'],
  moduleSettings: ['tenant-access', 'module-settings'],
  requestsRoot: ['tenant-access', 'requests'],
  loginSecurity: ['tenant-access', 'login-security'],
  sso: ['tenant-access', 'sso'],
  domains: ['tenant-access', 'domains'],
  me: ['tenant-access', 'me'],
  workerFleet: ['tenant-access', 'worker-fleet'],
  componentHealth: ['tenant-access', 'component-health'],
  encryption: ['tenant-access', 'encryption'],
};

export const tenantAccessHooks = {
  useMembers,
  useInviteMembers,
  useDirectory,
  useAddFromDirectory,
  useRemovePendingBinding,
  useUpdateAccess,
  useSetEnabled,
  useBulkSetEnabled,
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
  useSsoSettings,
  useSaveOidcSso,
  useSaveFeishuSso,
  useSaveWecomSso,
  useSaveDingtalkSso,
  useSaveSamlSso,
  useStartPlatformBinding,
  useRemovePlatformBinding,
  useUpdateMfaPolicy,
  useDomains,
  useCreateDomain,
  useVerifyDomain,
  useRemoveDomain,
  useUpdateSlug,
  useSetSsoEnabled,
  useStartSsoTest,
  useMyAccess,
  useRequestModule,
  useWorkerFleet,
  useWorkerAction,
  useComponentHealth,
  useConfirmBackup,
  useEncryptionStatus,
};
