import {
  DiagnosticsBundle,
  OptionalServiceKind,
  ServiceCheckRequest,
  ServiceCheckResult,
  SetupChecklist,
  SetupStatus,
  SystemOverview,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const systemApi = {
  getOverview(): Promise<SystemOverview> {
    return api.get<SystemOverview>('/v1/health/overview');
  },
  getSetupStatus(): Promise<SetupStatus> {
    return api.get<SetupStatus>('/v1/health/setup');
  },
  getSetupChecklist(): Promise<SetupChecklist> {
    return api.get<SetupChecklist>('/v1/health/setup-checklist');
  },
  checkSetupService({
    kind,
  }: {
    kind: OptionalServiceKind;
  }): Promise<ServiceCheckResult> {
    return api.post<ServiceCheckResult>('/v1/health/setup/service-check', {
      kind,
    });
  },
  checkService(request: ServiceCheckRequest): Promise<ServiceCheckResult> {
    return api.post<ServiceCheckResult>('/v1/health/services/check', request);
  },
  getDiagnosticsBundle(): Promise<DiagnosticsBundle> {
    return api.get<DiagnosticsBundle>('/v1/health/diagnostics-bundle');
  },
};
