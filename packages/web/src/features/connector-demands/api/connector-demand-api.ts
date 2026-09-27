import { SeekPage } from '@fema-ipaas/core-utils';
import {
  ConnectorDemand,
  CreateConnectorDemandRequestBody,
  ListConnectorDemandsRequestQuery,
  UpdateConnectorDemandRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const connectorDemandApi = {
  create(request: CreateConnectorDemandRequestBody): Promise<ConnectorDemand> {
    return api.post<ConnectorDemand>('/v1/connector-demands', request);
  },
  list(
    request: ListConnectorDemandsRequestQuery,
  ): Promise<SeekPage<ConnectorDemand>> {
    return api.get<SeekPage<ConnectorDemand>>('/v1/connector-demands', request);
  },
  updateStatus(
    id: string,
    request: UpdateConnectorDemandRequestBody,
  ): Promise<ConnectorDemand> {
    return api.post<ConnectorDemand>(`/v1/connector-demands/${id}`, request);
  },
};
