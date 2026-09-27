import {
  ChangeBlueprintVersionStatusRequest,
  ConnectorBlueprintDetail,
  ConnectorBlueprintListFilter,
  CreateConnectorBlueprintRequest,
  DebugBlueprintOperationRequest,
  ImportOpenApiBlueprintRequest,
  PreviewOpenApiBlueprintRequest,
  PublishConnectorBlueprintRequest,
  RunBlueprintAuthTestRequest,
  SaveBlueprintAuthTestDataRequest,
  SaveBlueprintDebugRecordRequest,
  TransferBlueprintOwnershipRequest,
  UpdateBlueprintCanaryRequest,
  UpdateBlueprintCollaboratorsRequest,
  UpdateConnectorBlueprintRequest,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { connectorBlueprintsApi } from '../api/connector-blueprints-api';

function useConnectorBlueprints({
  filter,
  enabled = true,
}: {
  filter: ConnectorBlueprintListFilter;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'list', filter],
    queryFn: () => connectorBlueprintsApi.list(filter),
    enabled,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useConnectorBlueprint(id: string | null) {
  return useQuery({
    queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', id],
    queryFn: () => connectorBlueprintsApi.get(id ?? ''),
    enabled: !!id,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useBlueprintCandidates(id: string | null) {
  return useQuery({
    queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'candidates', id],
    queryFn: () => connectorBlueprintsApi.candidates(id ?? ''),
    enabled: !!id,
  });
}

function useBlueprintProjects(id: string | null) {
  return useQuery({
    queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'projects', id],
    queryFn: () => connectorBlueprintsApi.projects(id ?? ''),
    enabled: !!id,
  });
}

function useCreateConnectorBlueprint({
  onSuccess,
  onError,
}: MutationCallbacks<ConnectorBlueprintDetail> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateConnectorBlueprintRequest) =>
      connectorBlueprintsApi.create(request),
    onSuccess: (blueprint) => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY],
      });
      onSuccess?.(blueprint);
    },
    onError,
  });
}

function usePreviewOpenApiBlueprint() {
  return useMutation({
    mutationFn: (request: PreviewOpenApiBlueprintRequest) =>
      connectorBlueprintsApi.previewOpenApi(request),
  });
}

function useImportOpenApiBlueprint({
  onSuccess,
  onError,
}: MutationCallbacks<void> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ImportOpenApiBlueprintRequest) =>
      connectorBlueprintsApi.importOpenApi(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY],
      });
      onSuccess?.();
    },
    onError,
  });
}

function useUpdateConnectorBlueprint({
  id,
  onSuccess,
  onError,
}: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateConnectorBlueprintRequest) =>
      connectorBlueprintsApi.update(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', id],
      });
      onSuccess?.();
    },
    onError,
  });
}

function useDeleteConnectorBlueprint({
  onSuccess,
  onError,
}: MutationCallbacks<void> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => connectorBlueprintsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY],
      });
      onSuccess?.();
    },
    onError,
  });
}

function useUpdateBlueprintCollaborators({
  id,
  onSuccess,
  onError,
}: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateBlueprintCollaboratorsRequest) =>
      connectorBlueprintsApi.updateCollaborators(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', id],
      });
      onSuccess?.();
    },
    onError,
  });
}

function useTransferBlueprintOwnership({
  id,
  onSuccess,
  onError,
}: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: TransferBlueprintOwnershipRequest) =>
      connectorBlueprintsApi.transferOwnership(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY],
      });
      onSuccess?.();
    },
    onError,
  });
}

function useSaveBlueprintAuthTestData({
  id,
  onSuccess,
  onError,
}: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SaveBlueprintAuthTestDataRequest) =>
      connectorBlueprintsApi.saveAuthTestData(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', id],
      });
      onSuccess?.();
    },
    onError,
  });
}

function useRunBlueprintAuthTest({ id, onSuccess, onError }: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RunBlueprintAuthTestRequest) =>
      connectorBlueprintsApi.runAuthTest(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', id],
      });
      onSuccess?.();
    },
    onError,
  });
}

function usePublishBlueprintAuth({ id, onSuccess, onError }: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => connectorBlueprintsApi.publishAuth(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', id],
      });
      onSuccess?.();
    },
    onError,
  });
}

function useDebugBlueprintOperation({
  id,
  onError,
}: Omit<IdMutationParams, 'onSuccess'>) {
  return useMutation({
    mutationFn: (request: DebugBlueprintOperationRequest) =>
      connectorBlueprintsApi.debug(id, request),
    onError,
  });
}

function useSaveBlueprintDebugRecord({
  id,
  onSuccess,
  onError,
}: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: SaveBlueprintDebugRecordRequest) =>
      connectorBlueprintsApi.saveDebugRecord(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', id],
      });
      onSuccess?.();
    },
    onError,
  });
}

function usePublishConnectorBlueprint({
  id,
  onSuccess,
  onError,
}: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: PublishConnectorBlueprintRequest) =>
      connectorBlueprintsApi.publish(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY],
      });
      onSuccess?.();
    },
    onError,
  });
}

function useChangeBlueprintVersionStatus({
  id,
  onSuccess,
  onError,
}: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      versionId,
      request,
    }: {
      versionId: string;
      request: ChangeBlueprintVersionStatusRequest;
    }) => connectorBlueprintsApi.changeVersionStatus(id, versionId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', id],
      });
      onSuccess?.();
    },
    onError,
  });
}

function useUpdateBlueprintCanary({
  id,
  onSuccess,
  onError,
}: IdMutationParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      versionId,
      request,
    }: {
      versionId: string;
      request: UpdateBlueprintCanaryRequest;
    }) => connectorBlueprintsApi.updateCanary(id, versionId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', id],
      });
      onSuccess?.();
    },
    onError,
  });
}

export const connectorBlueprintHooks = {
  useConnectorBlueprints,
  useConnectorBlueprint,
  useBlueprintCandidates,
  useBlueprintProjects,
  useCreateConnectorBlueprint,
  usePreviewOpenApiBlueprint,
  useImportOpenApiBlueprint,
  useUpdateConnectorBlueprint,
  useDeleteConnectorBlueprint,
  useUpdateBlueprintCollaborators,
  useTransferBlueprintOwnership,
  useSaveBlueprintAuthTestData,
  useRunBlueprintAuthTest,
  usePublishBlueprintAuth,
  useDebugBlueprintOperation,
  useSaveBlueprintDebugRecord,
  usePublishConnectorBlueprint,
  useChangeBlueprintVersionStatus,
  useUpdateBlueprintCanary,
};

export const CONNECTOR_BLUEPRINTS_KEY = 'connector-blueprints';

type IdMutationParams = MutationCallbacks<void> & {
  id: string;
};

type MutationCallbacks<TSuccess> = {
  onSuccess?: (result: TSuccess) => void;
  onError?: (error: unknown) => void;
};
