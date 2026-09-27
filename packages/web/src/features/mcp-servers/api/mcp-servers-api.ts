import {
  McpServer,
  McpServerProbeResult,
  McpServerSaveResponse,
  McpServerToolTrialResult,
  McpServerUsage,
  SyncMcpServerToolsResponse,
  TestMcpServerRequestBody,
  TryMcpServerToolRequestBody,
  UpsertMcpServerRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const mcpServersApi = {
  list(request: { search?: string }): Promise<McpServer[]> {
    return api.get<McpServer[]>('/v1/mcp-servers', request);
  },
  test(request: TestMcpServerRequestBody): Promise<McpServerProbeResult> {
    return api.post<McpServerProbeResult>('/v1/mcp-servers/test', request);
  },
  create(request: UpsertMcpServerRequestBody): Promise<McpServerSaveResponse> {
    return api.post<McpServerSaveResponse>('/v1/mcp-servers', request);
  },
  get(id: string): Promise<McpServer> {
    return api.get<McpServer>(`/v1/mcp-servers/${id}`);
  },
  update(
    id: string,
    request: UpsertMcpServerRequestBody,
  ): Promise<McpServerSaveResponse> {
    return api.post<McpServerSaveResponse>(`/v1/mcp-servers/${id}`, request);
  },
  sync(id: string): Promise<SyncMcpServerToolsResponse> {
    return api.post<SyncMcpServerToolsResponse>(
      `/v1/mcp-servers/${id}/sync`,
      {},
    );
  },
  tryTool(
    id: string,
    request: TryMcpServerToolRequestBody,
  ): Promise<McpServerToolTrialResult> {
    return api.post<McpServerToolTrialResult>(
      `/v1/mcp-servers/${id}/tools/try`,
      request,
    );
  },
  usage(id: string): Promise<McpServerUsage> {
    return api.get<McpServerUsage>(`/v1/mcp-servers/${id}/usage`);
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/mcp-servers/${id}`);
  },
};
