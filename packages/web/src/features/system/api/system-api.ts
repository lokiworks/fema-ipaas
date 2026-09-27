import {
  DiagnosticsBundle,
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
  getDiagnosticsBundle(): Promise<DiagnosticsBundle> {
    return api.get<DiagnosticsBundle>('/v1/health/diagnostics-bundle');
  },
};
