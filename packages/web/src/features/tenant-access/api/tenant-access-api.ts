import {
  AddTenantUsersRequestBody,
  AddTenantUsersResponse,
  ComponentHealthCheck,
  ComponentHealthReport,
  CreateModuleAccessRequestBody,
  EncryptionKeyStatus,
  ListOwnedResourcesRequestQuery,
  ListOwnedResourcesResponse,
  ListTenantMembersResponse,
  LoginSecuritySettings,
  ModuleAccessRequest,
  ModuleAccessRequestStatus,
  ModuleAccessRequestWithUsers,
  ModuleAccessSettings,
  MyModuleAccess,
  ResetMemberPasswordResponse,
  TenantMember,
  TransferResourcesRequestBody,
  TransferResourcesResponse,
  UpdateLoginSecurityRequestBody,
  UpdateModuleAccessSettingsRequestBody,
  UpdateTenantMemberAccessRequestBody,
  WorkerFleet,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const tenantAccessApi = {
  listMembers(): Promise<ListTenantMembersResponse> {
    return api.get<ListTenantMembersResponse>('/v1/tenant-access/members');
  },
  inviteMembers(
    request: AddTenantUsersRequestBody,
  ): Promise<AddTenantUsersResponse> {
    return api.post<AddTenantUsersResponse>(
      '/v1/tenant-access/members/invite',
      request,
    );
  },
  updateAccess({
    userId,
    request,
  }: {
    userId: string;
    request: UpdateTenantMemberAccessRequestBody;
  }): Promise<TenantMember> {
    return api.post<TenantMember>(
      `/v1/tenant-access/members/${userId}/access`,
      request,
    );
  },
  setEnabled({
    userId,
    enabled,
  }: {
    userId: string;
    enabled: boolean;
  }): Promise<TenantMember> {
    return api.post<TenantMember>(
      `/v1/tenant-access/members/${userId}/${enabled ? 'enable' : 'disable'}`,
    );
  },
  resetPassword(userId: string): Promise<ResetMemberPasswordResponse> {
    return api.post<ResetMemberPasswordResponse>(
      `/v1/tenant-access/members/${userId}/reset-password`,
    );
  },
  removeMember({
    userId,
    transferToUserId,
  }: {
    userId: string;
    transferToUserId: string | null;
  }): Promise<void> {
    return api.delete<void>(
      `/v1/tenant-access/members/${userId}`,
      transferToUserId === null ? undefined : { transferToUserId },
    );
  },
  listResources(
    query: ListOwnedResourcesRequestQuery,
  ): Promise<ListOwnedResourcesResponse> {
    return api.get<ListOwnedResourcesResponse>(
      '/v1/tenant-access/resources',
      query,
    );
  },
  transferResources(
    request: TransferResourcesRequestBody,
  ): Promise<TransferResourcesResponse> {
    return api.post<TransferResourcesResponse>(
      '/v1/tenant-access/resources/transfer',
      request,
    );
  },
  getModuleSettings(): Promise<ModuleAccessSettings> {
    return api.get<ModuleAccessSettings>('/v1/tenant-access/module-settings');
  },
  updateModuleSettings(
    request: UpdateModuleAccessSettingsRequestBody,
  ): Promise<ModuleAccessSettings> {
    return api.post<ModuleAccessSettings>(
      '/v1/tenant-access/module-settings',
      request,
    );
  },
  listRequests(
    status: ModuleAccessRequestStatus | undefined,
  ): Promise<ModuleAccessRequestWithUsers[]> {
    return api.get<ModuleAccessRequestWithUsers[]>(
      '/v1/tenant-access/requests',
      status === undefined ? {} : { status },
    );
  },
  decideRequest({
    id,
    approve,
  }: {
    id: string;
    approve: boolean;
  }): Promise<ModuleAccessRequest> {
    return api.post<ModuleAccessRequest>(
      `/v1/tenant-access/requests/${id}/${approve ? 'approve' : 'reject'}`,
    );
  },
  getLoginSecurity(): Promise<LoginSecuritySettings> {
    return api.get<LoginSecuritySettings>('/v1/tenant-access/login-security');
  },
  updateLoginSecurity(
    request: UpdateLoginSecurityRequestBody,
  ): Promise<LoginSecuritySettings> {
    return api.post<LoginSecuritySettings>(
      '/v1/tenant-access/login-security',
      request,
    );
  },
  getMyAccess(): Promise<MyModuleAccess> {
    return api.get<MyModuleAccess>('/v1/tenant-access/me');
  },
  requestModule(
    request: CreateModuleAccessRequestBody,
  ): Promise<ModuleAccessRequest> {
    return api.post<ModuleAccessRequest>(
      '/v1/tenant-access/me/requests',
      request,
    );
  },
  getWorkerFleet(): Promise<WorkerFleet> {
    return api.get<WorkerFleet>('/v1/worker-machines/fleet');
  },
  drainWorker(id: string): Promise<WorkerFleet> {
    return api.post<WorkerFleet>(`/v1/worker-machines/${id}/drain`);
  },
  resumeWorker(id: string): Promise<WorkerFleet> {
    return api.post<WorkerFleet>(`/v1/worker-machines/${id}/resume`);
  },
  removeWorker(id: string): Promise<void> {
    return api.delete<void>(`/v1/worker-machines/${id}`);
  },
  getComponentHealth(): Promise<ComponentHealthReport> {
    return api.get<ComponentHealthReport>('/v1/health/components');
  },
  confirmBackup(): Promise<ComponentHealthCheck> {
    return api.post<ComponentHealthCheck>('/v1/health/backup-confirmation');
  },
  getEncryptionStatus(): Promise<EncryptionKeyStatus> {
    return api.get<EncryptionKeyStatus>('/v1/encryption/status');
  },
  recordAuditExport(rows: number): Promise<void> {
    return api.post<void>('/v1/audit-events/exports', { rows });
  },
};
