import {
  McpService,
  McpServiceWithToken,
  McpToolCandidate,
  UpsertMcpServiceRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const mcpServicesApi = {
  list(projectId: string): Promise<McpService[]> {
    return api.get<McpService[]>('/v1/mcp-services', { projectId });
  },
  candidates(projectId: string): Promise<McpToolCandidate[]> {
    return api.get<McpToolCandidate[]>('/v1/mcp-services/candidates', {
      projectId,
    });
  },
  create(request: UpsertMcpServiceRequestBody): Promise<McpServiceWithToken> {
    return api.post<McpServiceWithToken>('/v1/mcp-services', request);
  },
  update({
    id,
    request,
  }: {
    id: string;
    request: UpsertMcpServiceRequestBody;
  }): Promise<McpService> {
    return api.post<McpService>(`/v1/mcp-services/${id}`, request);
  },
  rotateToken(id: string): Promise<McpServiceWithToken> {
    return api.post<McpServiceWithToken>(
      `/v1/mcp-services/${id}/rotate-token`,
      {},
    );
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/mcp-services/${id}`);
  },
};
