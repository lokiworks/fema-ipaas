import {
  CreateMcpServiceRequestBody,
  ListMcpServicesRequestQuery,
  McpConnectorToolParamsQuery,
  McpService,
  McpServiceApiKey,
  McpServiceIssues,
  McpServiceMembership,
  McpToolDebugRequestBody,
  McpToolDebugResult,
  McpToolParam,
  McpWorkflowToolCandidate,
  PublishMcpServiceRequestBody,
  SetMcpServiceListedRequestBody,
  SetMcpServiceStatusRequestBody,
  TransferMcpServiceRequestBody,
  UpdateMcpServiceAvailabilityRequestBody,
  UpdateMcpServiceConnectionsRequestBody,
  UpdateMcpServiceInfoRequestBody,
  UpdateMcpServiceMyConnectionsRequestBody,
  UpdateMcpServiceToolsRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const mcpServicesApi = {
  list(request: ListMcpServicesRequestQuery): Promise<McpService[]> {
    return api.get<McpService[]>('/v1/mcp-services', request);
  },
  candidates(projectId: string): Promise<McpWorkflowToolCandidate[]> {
    return api.get<McpWorkflowToolCandidate[]>('/v1/mcp-services/candidates', {
      projectId,
    });
  },
  connectorToolParams(
    request: McpConnectorToolParamsQuery,
  ): Promise<McpToolParam[]> {
    return api.get<McpToolParam[]>(
      '/v1/mcp-services/connector-tool-params',
      request,
    );
  },
  create(request: CreateMcpServiceRequestBody): Promise<McpService> {
    return api.post<McpService>('/v1/mcp-services', request);
  },
  get(id: string): Promise<McpService> {
    return api.get<McpService>(`/v1/mcp-services/${id}`);
  },
  issues(id: string): Promise<McpServiceIssues> {
    return api.get<McpServiceIssues>(`/v1/mcp-services/${id}/issues`);
  },
  updateInfo({
    id,
    request,
  }: {
    id: string;
    request: UpdateMcpServiceInfoRequestBody;
  }): Promise<McpService> {
    return api.post<McpService>(`/v1/mcp-services/${id}/info`, request);
  },
  updateTools({
    id,
    request,
  }: {
    id: string;
    request: UpdateMcpServiceToolsRequestBody;
  }): Promise<McpService> {
    return api.post<McpService>(`/v1/mcp-services/${id}/tools`, request);
  },
  updateConnections({
    id,
    request,
  }: {
    id: string;
    request: UpdateMcpServiceConnectionsRequestBody;
  }): Promise<McpService> {
    return api.post<McpService>(`/v1/mcp-services/${id}/connections`, request);
  },
  updateAvailability({
    id,
    request,
  }: {
    id: string;
    request: UpdateMcpServiceAvailabilityRequestBody;
  }): Promise<McpService> {
    return api.post<McpService>(`/v1/mcp-services/${id}/availability`, request);
  },
  publish({
    id,
    request,
  }: {
    id: string;
    request: PublishMcpServiceRequestBody;
  }): Promise<McpService> {
    return api.post<McpService>(`/v1/mcp-services/${id}/publish`, request);
  },
  setStatus({
    id,
    request,
  }: {
    id: string;
    request: SetMcpServiceStatusRequestBody;
  }): Promise<McpService> {
    return api.post<McpService>(`/v1/mcp-services/${id}/status`, request);
  },
  setListed({
    id,
    request,
  }: {
    id: string;
    request: SetMcpServiceListedRequestBody;
  }): Promise<McpService> {
    return api.post<McpService>(`/v1/mcp-services/${id}/listed`, request);
  },
  transfer({
    id,
    request,
  }: {
    id: string;
    request: TransferMcpServiceRequestBody;
  }): Promise<McpService> {
    return api.post<McpService>(`/v1/mcp-services/${id}/transfer`, request);
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/mcp-services/${id}`);
  },
  obtain(id: string): Promise<McpServiceMembership> {
    return api.post<McpServiceMembership>(`/v1/mcp-services/${id}/obtain`, {});
  },
  leave(id: string): Promise<void> {
    return api.delete<void>(`/v1/mcp-services/${id}/obtain`);
  },
  membership(id: string): Promise<McpServiceMembership | null> {
    return api.get<McpServiceMembership | null>(
      `/v1/mcp-services/${id}/membership`,
    );
  },
  myKey(id: string): Promise<McpServiceApiKey> {
    return api.get<McpServiceApiKey>(`/v1/mcp-services/${id}/my-key`);
  },
  resetMyKey(id: string): Promise<McpServiceApiKey> {
    return api.post<McpServiceApiKey>(
      `/v1/mcp-services/${id}/my-key/reset`,
      {},
    );
  },
  updateMyConnections({
    id,
    request,
  }: {
    id: string;
    request: UpdateMcpServiceMyConnectionsRequestBody;
  }): Promise<McpServiceMembership> {
    return api.post<McpServiceMembership>(
      `/v1/mcp-services/${id}/my-connections`,
      request,
    );
  },
  debug({
    id,
    request,
  }: {
    id: string;
    request: McpToolDebugRequestBody;
  }): Promise<McpToolDebugResult> {
    return api.post<McpToolDebugResult>(
      `/v1/mcp-services/${id}/debug`,
      request,
    );
  },
};
