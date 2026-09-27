import {
  ConnectorUsageResponse,
  ConnectorWorkflowUsage,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const connectorUsageApi = {
  summary(): Promise<ConnectorUsageResponse> {
    return api.get<ConnectorUsageResponse>('/v1/connector-usage');
  },
  workflows(connectorName: string): Promise<ConnectorWorkflowUsage[]> {
    return api.get<ConnectorWorkflowUsage[]>('/v1/connector-usage/workflows', {
      connectorName,
    });
  },
};
