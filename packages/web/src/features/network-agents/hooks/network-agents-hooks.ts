import {
  CreateNetworkAgentRequest,
  UpdateNetworkAgentRequest,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { networkAgentsApi } from '../api/network-agents-api';

const QUERY_KEY = ['network-agents'];

function useNetworkAgents() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => networkAgentsApi.list({}),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useCreateNetworkAgent(onSuccess: (token: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateNetworkAgentRequest) =>
      networkAgentsApi.create(request),
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onSuccess(agent.token);
    },
  });
}

function useUpdateNetworkAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: UpdateNetworkAgentRequest;
    }) => networkAgentsApi.update(id, request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

function useDeleteNetworkAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => networkAgentsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export const networkAgentsHooks = {
  useNetworkAgents,
  useCreateNetworkAgent,
  useUpdateNetworkAgent,
  useDeleteNetworkAgent,
};
