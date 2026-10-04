import {
  OptionalServiceKind,
  SaveServiceSettingResponse,
  ServiceCheckResult,
  ServiceSettingDraft,
  ServiceSettingView,
  TestServiceSettingRequest,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const serviceSettingsApi = {
  list(): Promise<ServiceSettingView[]> {
    return api.get<ServiceSettingView[]>('/v1/service-settings');
  },
  save(draft: ServiceSettingDraft): Promise<SaveServiceSettingResponse> {
    return api.post<SaveServiceSettingResponse>('/v1/service-settings', draft);
  },
  test(request: TestServiceSettingRequest): Promise<ServiceCheckResult> {
    return api.post<ServiceCheckResult>('/v1/service-settings/test', request);
  },
  clear({ kind }: { kind: OptionalServiceKind }): Promise<ServiceSettingView> {
    return api.delete<ServiceSettingView>(`/v1/service-settings/${kind}`);
  },
};
