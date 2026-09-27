import {
  ConnectorDemandStatus,
  CreateConnectorDemandRequestBody,
  ListConnectorDemandsRequestQuery,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { connectorDemandApi } from '../api/connector-demand-api';

const CONNECTOR_DEMANDS_QUERY_KEY = 'connector-demands';

export const connectorDemandHooks = {
  useConnectorDemands: (query: ListConnectorDemandsRequestQuery) => {
    return useQuery({
      queryKey: [CONNECTOR_DEMANDS_QUERY_KEY, query],
      queryFn: () => connectorDemandApi.list(query),
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
    });
  },
};

export const connectorDemandMutations = {
  useCreateConnectorDemand: ({
    onSuccess,
    onError,
  }: {
    onSuccess: () => void;
    onError: (error: unknown) => void;
  }) => {
    return useMutation({
      mutationFn: (request: CreateConnectorDemandRequestBody) =>
        connectorDemandApi.create(request),
      onSuccess,
      onError,
    });
  },
  useUpdateConnectorDemandStatus: ({
    onError,
  }: {
    onError: (error: unknown) => void;
  }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        id,
        status,
      }: {
        id: string;
        status: ConnectorDemandStatus;
      }) => connectorDemandApi.updateStatus(id, { status }),
      onSuccess: () => {
        return queryClient.invalidateQueries({
          queryKey: [CONNECTOR_DEMANDS_QUERY_KEY],
        });
      },
      onError,
    });
  },
};
