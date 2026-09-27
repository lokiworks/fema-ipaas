import {
  CreateMcpServiceRequestBody,
  McpConnectorToolParamsQuery,
  McpServiceListTab,
  McpToolDebugRequestBody,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api, API_URL } from '@/lib/api';

import { mcpServicesApi } from '../api/mcp-services-api';

function useServices({
  tab,
  search,
}: {
  tab: McpServiceListTab;
  search: string;
}) {
  return useQuery({
    queryKey: [MCP_SERVICES_KEY, 'list', tab, search],
    queryFn: () => mcpServicesApi.list({ tab, search: search || undefined }),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useService(id: string) {
  return useQuery({
    queryKey: [MCP_SERVICES_KEY, 'detail', id],
    queryFn: () => mcpServicesApi.get(id),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useIssues({ id, enabled }: { id: string; enabled: boolean }) {
  return useQuery({
    queryKey: [MCP_SERVICES_KEY, 'issues', id],
    queryFn: () => mcpServicesApi.issues(id),
    enabled,
  });
}

function useCandidates(projectId: string) {
  return useQuery({
    queryKey: [MCP_SERVICES_KEY, 'candidates', projectId],
    queryFn: () => mcpServicesApi.candidates(projectId),
  });
}

function useConnectorToolParams({
  request,
  enabled,
}: {
  request: McpConnectorToolParamsQuery;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: [MCP_SERVICES_KEY, 'connector-tool-params', request],
    queryFn: () => mcpServicesApi.connectorToolParams(request),
    enabled,
  });
}

function useMembership({ id, enabled }: { id: string; enabled: boolean }) {
  return useQuery({
    queryKey: [MCP_SERVICES_KEY, 'membership', id],
    queryFn: () => mcpServicesApi.membership(id),
    enabled,
  });
}

function useMyKey({ id, enabled }: { id: string; enabled: boolean }) {
  return useQuery({
    queryKey: [MCP_SERVICES_KEY, 'my-key', id],
    queryFn: () => mcpServicesApi.myKey(id),
    enabled,
  });
}

function useEndpointUrl() {
  return (endpointPath: string) => `${API_URL}/${endpointPath}`;
}

function useCreateService({ onError }: ErrorHandler) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateMcpServiceRequestBody) =>
      mcpServicesApi.create(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MCP_SERVICES_KEY] });
    },
    onError: (error) => onError(serverMessage(error)),
  });
}

function useUpdateInfo({ id, onError }: { id: string } & ErrorHandler) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateMcpServiceInfoRequestBody) =>
      mcpServicesApi.updateInfo({ id, request }),
    onSuccess: () => {
      invalidateService({ queryClient, id });
      toast.success(t('Saved'));
    },
    onError: (error) => onError(serverMessage(error)),
  });
}

function useUpdateTools(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateMcpServiceToolsRequestBody) =>
      mcpServicesApi.updateTools({ id, request }),
    onSuccess: () => {
      invalidateService({ queryClient, id });
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useUpdateConnections(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateMcpServiceConnectionsRequestBody) =>
      mcpServicesApi.updateConnections({ id, request }),
    onSuccess: () => {
      invalidateService({ queryClient, id });
      toast.success(t('Connection settings saved'));
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useUpdateAvailability(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateMcpServiceAvailabilityRequestBody) =>
      mcpServicesApi.updateAvailability({ id, request }),
    onSuccess: () => {
      invalidateService({ queryClient, id });
      toast.success(t('Availability saved, effective immediately'));
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function usePublish(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: PublishMcpServiceRequestBody) =>
      mcpServicesApi.publish({ id, request }),
    onSuccess: (service) => {
      invalidateService({ queryClient, id });
      toast.success(
        t('Published {version}', { version: service.publishedVersion ?? '' }),
      );
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useSetStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SetMcpServiceStatusRequestBody) =>
      mcpServicesApi.setStatus({ id, request }),
    onSuccess: () => {
      invalidateService({ queryClient, id });
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useSetListed(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SetMcpServiceListedRequestBody) =>
      mcpServicesApi.setListed({ id, request }),
    onSuccess: () => {
      invalidateService({ queryClient, id });
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useTransfer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: TransferMcpServiceRequestBody) =>
      mcpServicesApi.transfer({ id, request }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MCP_SERVICES_KEY] });
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mcpServicesApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MCP_SERVICES_KEY] });
      toast.success(t('MCP service deleted'));
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useObtain(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => mcpServicesApi.obtain(id),
    onSuccess: () => {
      invalidateService({ queryClient, id });
      toast.success(t('Obtained. See the Usage tab for the connection setup.'));
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useLeave(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => mcpServicesApi.leave(id),
    onSuccess: () => {
      invalidateService({ queryClient, id });
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useResetMyKey(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => mcpServicesApi.resetMyKey(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [MCP_SERVICES_KEY, 'my-key', id],
      });
      toast.success(t('Reset. Copy the new key and update your clients.'));
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useUpdateMyConnections(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateMcpServiceMyConnectionsRequestBody) =>
      mcpServicesApi.updateMyConnections({ id, request }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [MCP_SERVICES_KEY, 'membership', id],
      });
      toast.success(t('Connection saved'));
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useDebugTool(id: string) {
  return useMutation({
    mutationFn: (request: McpToolDebugRequestBody) =>
      mcpServicesApi.debug({ id, request }),
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function invalidateService({
  queryClient,
  id,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  id: string;
}): void {
  void queryClient.invalidateQueries({
    queryKey: [MCP_SERVICES_KEY, 'detail', id],
  });
  void queryClient.invalidateQueries({
    queryKey: [MCP_SERVICES_KEY, 'issues', id],
  });
  void queryClient.invalidateQueries({ queryKey: [MCP_SERVICES_KEY, 'list'] });
}

function serverMessage(error: unknown): string {
  return api.extractServerErrorMessage(error, t('Something went wrong'));
}

const MCP_SERVICES_KEY = 'mcp-services';

export const mcpServicesHooks = {
  useServices,
  useService,
  useIssues,
  useCandidates,
  useConnectorToolParams,
  useMembership,
  useMyKey,
  useEndpointUrl,
  useCreateService,
  useUpdateInfo,
  useUpdateTools,
  useUpdateConnections,
  useUpdateAvailability,
  usePublish,
  useSetStatus,
  useSetListed,
  useTransfer,
  useDeleteService,
  useObtain,
  useLeave,
  useResetMyKey,
  useUpdateMyConnections,
  useDebugTool,
};

type ErrorHandler = { onError: (message: string) => void };
