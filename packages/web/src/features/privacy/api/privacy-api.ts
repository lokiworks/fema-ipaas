import {
  CreateDataErasureRequestBody,
  DataErasureRequest,
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
  confirmErasure(id: string): Promise<DataErasureRequest> {
    return api.post<DataErasureRequest>(
      `/v1/privacy-settings/erasures/${id}/confirm`,
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
