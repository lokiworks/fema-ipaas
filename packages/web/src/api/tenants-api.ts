import {
  AuthenticationResponse,
  TenantWithoutSensitiveData,
  UpdateTenantRequestBody,
} from '@fema/shared';

import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

export const tenantApi = {
  createTenant({ name }: { name: string }) {
    return api.post<AuthenticationResponse>('/v1/tenants', { name });
  },
  deleteTenant() {
    return api.delete<void>(
      `/v1/tenants/${authenticationSession.getTenantId()}`,
    );
  },
  getCurrentTenant() {
    const tenantId = authenticationSession.getTenantId();
    if (!tenantId) {
      throw Error('No tenant id found');
    }
    return api.get<TenantWithoutSensitiveData>(`/v1/tenants/${tenantId}`);
  },

  activateLicenseKey(licenseKey: string) {
    return api.post<void>(`/v1/tenant-billing/activate`, {
      licenseKey,
    });
  },

  update(req: UpdateTenantRequestBody, tenantId: string) {
    return api.post<TenantWithoutSensitiveData>(`/v1/tenants/${tenantId}`, req);
  },
  updateWithFormData(formdata: FormData, tenantId: string) {
    return api.post<TenantWithoutSensitiveData>(
      `/v1/tenants/${tenantId}`,
      formdata,
      {},
      {
        'Content-Type': 'multipart/form-data',
      },
    );
  },
};
