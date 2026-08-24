import {
  CreateNetworkAgentRequest,
  ListNetworkAgentsRequest,
  NetworkAgent,
  NetworkAgentWithToken,
  SeekPage,
  UpdateNetworkAgentRequest,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const networkAgentsApi = {
  list(request: ListNetworkAgentsRequest) {
    return api.get<SeekPage<NetworkAgent>>('/v1/network-agents', request);
  },
  create(request: CreateNetworkAgentRequest) {
    return api.post<NetworkAgentWithToken>('/v1/network-agents', request);
  },
  update(id: string, request: UpdateNetworkAgentRequest) {
    return api.post<NetworkAgent>(`/v1/network-agents/${id}`, request);
  },
  delete(id: string) {
    return api.delete<void>(`/v1/network-agents/${id}`);
  },
};
