import {
  McpServerSaveResponse,
  TestMcpServerRequestBody,
  TryMcpServerToolRequestBody,
  UpsertMcpServerRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { mcpServersApi } from '../api/mcp-servers-api';

const MCP_SERVERS_QUERY_KEY = 'mcp-servers';
const MCP_SERVER_QUERY_KEY = 'mcp-server';
const MCP_SERVER_USAGE_QUERY_KEY = 'mcp-server-usage';

export const mcpServersHooks = {
  useMcpServers: ({
    search,
    primary = false,
  }: {
    search?: string;
    primary?: boolean;
  } = {}) => {
    return useQuery({
      queryKey: [MCP_SERVERS_QUERY_KEY, search],
      queryFn: () => mcpServersApi.list({ search }),
      meta: primary
        ? { showErrorDialog: true, loadSubsetOptions: {} }
        : undefined,
    });
  },
  useMcpServer: (id: string) => {
    return useQuery({
      queryKey: [MCP_SERVER_QUERY_KEY, id],
      queryFn: () => mcpServersApi.get(id),
      enabled: id.length > 0,
    });
  },
  useMcpServerUsage: (id: string) => {
    return useQuery({
      queryKey: [MCP_SERVER_USAGE_QUERY_KEY, id],
      queryFn: () => mcpServersApi.usage(id),
      enabled: id.length > 0,
    });
  },
};

export const mcpServersMutations = {
  useTestMcpServer: () => {
    return useMutation({
      mutationFn: (request: TestMcpServerRequestBody) =>
        mcpServersApi.test(request),
    });
  },
  useSaveMcpServer: ({
    id,
    onSuccess,
    onError,
  }: {
    id?: string;
    onSuccess: (response: McpServerSaveResponse) => void;
    onError: (error: unknown) => void;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (request: UpsertMcpServerRequestBody) =>
        id ? mcpServersApi.update(id, request) : mcpServersApi.create(request),
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({
          queryKey: [MCP_SERVERS_QUERY_KEY],
        });
        if (id) {
          await queryClient.invalidateQueries({
            queryKey: [MCP_SERVER_QUERY_KEY, id],
          });
        }
        onSuccess(response);
      },
      onError,
    });
  },
  useSyncMcpServerTools: ({
    id,
    onSuccess,
    onError,
  }: {
    id: string;
    onSuccess: (response: {
      added: string[];
      removed: string[];
      removedInUse: string[];
    }) => void;
    onError: (error: unknown) => void;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => mcpServersApi.sync(id),
      onSuccess: async (response) => {
        await queryClient.invalidateQueries({
          queryKey: [MCP_SERVER_QUERY_KEY, id],
        });
        await queryClient.invalidateQueries({
          queryKey: [MCP_SERVERS_QUERY_KEY],
        });
        onSuccess(response);
      },
      onError,
    });
  },
  useTryMcpServerTool: () => {
    return useMutation({
      mutationFn: ({
        id,
        request,
      }: {
        id: string;
        request: TryMcpServerToolRequestBody;
      }) => mcpServersApi.tryTool(id, request),
    });
  },
  useDeleteMcpServer: ({
    onSuccess,
    onError,
  }: {
    onSuccess: () => void;
    onError: (error: unknown) => void;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => mcpServersApi.delete(id),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: [MCP_SERVERS_QUERY_KEY],
        });
        onSuccess();
      },
      onError,
    });
  },
};
