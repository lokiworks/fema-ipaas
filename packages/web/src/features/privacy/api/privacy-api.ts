import {
  ConfirmDataErasureRequestBody,
  CreateDataErasureRequestBody,
  DataErasureReceipt,
  DataErasureRequest,
  PrivacyOverview,
  PrivacySettings,
  RevealExecutionPayloadRequestBody,
  RevealExecutionPayloadResponse,
  UpdatePrivacySettingsRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const privacyApi = {
  get(): Promise<PrivacySettings> {
    return api.get<PrivacySettings>('/v1/privacy-settings');
  },
  update(request: UpdatePrivacySettingsRequestBody): Promise<PrivacySettings> {
    return api.post<PrivacySettings>('/v1/privacy-settings', request);
  },
  overview(): Promise<PrivacyOverview> {
    return api.get<PrivacyOverview>('/v1/privacy-settings/overview');
  },
  listErasures(): Promise<DataErasureRequest[]> {
    return api.get<DataErasureRequest[]>('/v1/privacy-settings/erasures');
  },
  createErasure(
    request: CreateDataErasureRequestBody,
  ): Promise<DataErasureRequest> {
    return api.post<DataErasureRequest>(
      '/v1/privacy-settings/erasures',
      request,
    );
  },
  confirmErasure(
    id: string,
    request: ConfirmDataErasureRequestBody,
  ): Promise<DataErasureRequest> {
    return api.post<DataErasureRequest>(
      `/v1/privacy-settings/erasures/${id}/confirm`,
      request,
    );
  },
  erasureReceipt(id: string): Promise<DataErasureReceipt> {
    return api.get<DataErasureReceipt>(
      `/v1/privacy-settings/erasures/${id}/receipt`,
    );
  },
  cancelErasure(id: string): Promise<DataErasureRequest> {
    return api.post<DataErasureRequest>(
      `/v1/privacy-settings/erasures/${id}/cancel`,
    );
  },
  reveal(
    executionId: string,
    request: RevealExecutionPayloadRequestBody,
  ): Promise<RevealExecutionPayloadResponse> {
    return api.post<RevealExecutionPayloadResponse>(
      `/v1/executions/${executionId}/reveal`,
      request,
    );
  },
};
