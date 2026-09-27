import { FlagId, UpsertMcpServiceRequestBody } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { flagsHooks } from '@/hooks/flags-hooks';
import { api, API_URL } from '@/lib/api';

import { mcpServicesApi } from '../api/mcp-services-api';
import { mcpServiceUtils } from '../utils/mcp-service-utils';

function useMcpServices(projectId: string) {
  return useQuery({
    queryKey: [MCP_SERVICES_KEY, 'list', projectId],
    queryFn: () => mcpServicesApi.list(projectId),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useCandidates(projectId: string) {
  return useQuery({
    queryKey: [MCP_SERVICES_KEY, 'candidates', projectId],
    queryFn: () => mcpServicesApi.candidates(projectId),
  });
}

function useCreateMcpService({ onError }: ErrorHandler) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertMcpServiceRequestBody) =>
      mcpServicesApi.create(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MCP_SERVICES_KEY] });
    },
    onError: (error) => onError(serverMessage(error)),
  });
}

function useUpdateMcpService({ onError }: ErrorHandler) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: UpsertMcpServiceRequestBody;
    }) => mcpServicesApi.update({ id, request }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MCP_SERVICES_KEY] });
      toast.success(t('MCP service saved'));
    },
    onError: (error) => onError(serverMessage(error)),
  });
}

function useRotateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mcpServicesApi.rotateToken(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MCP_SERVICES_KEY] });
    },
    onError: (error) => toast.error(serverMessage(error)),
  });
}

function useDeleteMcpService() {
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

function useEndpointUrl() {
  const { data: webhookUrlPrefix } = flagsHooks.useFlag<string>(
    FlagId.WEBHOOK_URL_PREFIX,
  );
  return (serviceId: string) =>
    mcpServiceUtils.endpointUrl({
      webhookUrlPrefix: webhookUrlPrefix ?? undefined,
      fallbackApiUrl: API_URL,
      serviceId,
    });
}

function serverMessage(error: unknown): string {
  return api.extractServerErrorMessage(error, t('Something went wrong'));
}

const MCP_SERVICES_KEY = 'mcp-services';

export const mcpServicesHooks = {
  useMcpServices,
  useCandidates,
  useCreateMcpService,
  useUpdateMcpService,
  useRotateToken,
  useDeleteMcpService,
  useEndpointUrl,
};

type ErrorHandler = { onError: (message: string) => void };
