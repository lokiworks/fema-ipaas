import { SeekPage } from '@fema-ipaas/core-utils';
import {
  CreatePlatformClientRequestBody,
  CreatePlatformClientResponse,
  GrantInstanceOperatorRequestBody,
  InstanceOperator,
  InstanceSettings,
  ListOperatorTenantsRequestQuery,
  OperatorCreateTenantRequestBody,
  OperatorCreateTenantResponse,
  OperatorTenantSummary,
  PlatformClient,
  PlatformLoginAppKind,
  PlatformLoginAppPublic,
  SmsSettingsPublic,
  TenantLimitsUpdate,
  TestSmsSettingsRequestBody,
  UpdateInstanceSettingsRequestBody,
  UpdatePlatformLoginAppRequestBody,
  UpdateSmsSettingsRequestBody,
  UpdateTenantSlugRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const operatorApi = {
  listTenants(
    query: ListOperatorTenantsRequestQuery,
  ): Promise<SeekPage<OperatorTenantSummary>> {
    return api.get<SeekPage<OperatorTenantSummary>>(
      '/v1/operator/tenants',
      query,
    );
  },
  createTenant(
    request: OperatorCreateTenantRequestBody,
  ): Promise<OperatorCreateTenantResponse> {
    return api.post<OperatorCreateTenantResponse>(
      '/v1/operator/tenants',
      request,
    );
  },
  getTenant(id: string): Promise<OperatorTenantSummary> {
    return api.get<OperatorTenantSummary>(`/v1/operator/tenants/${id}`);
  },
  suspendTenant(id: string): Promise<OperatorTenantSummary> {
    return api.post<OperatorTenantSummary>(
      `/v1/operator/tenants/${id}/suspend`,
    );
  },
  resumeTenant(id: string): Promise<OperatorTenantSummary> {
    return api.post<OperatorTenantSummary>(`/v1/operator/tenants/${id}/resume`);
  },
  updateLimits({
    id,
    request,
  }: {
    id: string;
    request: TenantLimitsUpdate;
  }): Promise<OperatorTenantSummary> {
    return api.post<OperatorTenantSummary>(
      `/v1/operator/tenants/${id}/limits`,
      request,
    );
  },
  updateSlug({
    id,
    request,
  }: {
    id: string;
    request: UpdateTenantSlugRequestBody;
  }): Promise<OperatorTenantSummary> {
    return api.post<OperatorTenantSummary>(
      `/v1/operator/tenants/${id}/slug`,
      request,
    );
  },
  listOperators(): Promise<InstanceOperator[]> {
    return api.get<InstanceOperator[]>('/v1/operator/operators');
  },
  grantOperator(
    request: GrantInstanceOperatorRequestBody,
  ): Promise<InstanceOperator> {
    return api.post<InstanceOperator>('/v1/operator/operators', request);
  },
  revokeOperator(identityId: string): Promise<void> {
    return api.delete<void>(`/v1/operator/operators/${identityId}`);
  },
  getSettings(): Promise<InstanceSettings> {
    return api.get<InstanceSettings>('/v1/operator/settings');
  },
  updateSettings(
    request: UpdateInstanceSettingsRequestBody,
  ): Promise<InstanceSettings> {
    return api.post<InstanceSettings>('/v1/operator/settings', request);
  },
  listPlatformClients(): Promise<PlatformClient[]> {
    return api.get<PlatformClient[]>('/v1/operator/platform-clients');
  },
  createPlatformClient(
    request: CreatePlatformClientRequestBody,
  ): Promise<CreatePlatformClientResponse> {
    return api.post<CreatePlatformClientResponse>(
      '/v1/operator/platform-clients',
      request,
    );
  },
  revokePlatformClient(id: string): Promise<PlatformClient> {
    return api.post<PlatformClient>(
      `/v1/operator/platform-clients/${id}/revoke`,
    );
  },
  getSmsSettings(): Promise<SmsSettingsPublic | null> {
    return api.get<SmsSettingsPublic | null>('/v1/operator/sms-settings');
  },
  saveSmsSettings(
    request: UpdateSmsSettingsRequestBody,
  ): Promise<SmsSettingsPublic> {
    return api.post<SmsSettingsPublic>('/v1/operator/sms-settings', request);
  },
  testSmsSettings(request: TestSmsSettingsRequestBody): Promise<void> {
    return api.post<void>('/v1/operator/sms-settings/test', request);
  },
  listPlatformLoginApps(): Promise<PlatformLoginAppPublic[]> {
    return api.get<PlatformLoginAppPublic[]>(
      '/v1/operator/platform-login-apps',
    );
  },
  savePlatformLoginApp({
    kind,
    request,
  }: {
    kind: PlatformLoginAppKind;
    request: UpdatePlatformLoginAppRequestBody;
  }): Promise<PlatformLoginAppPublic> {
    return api.post<PlatformLoginAppPublic>(
      `/v1/operator/platform-login-apps/${kind}`,
      request,
    );
  },
};
