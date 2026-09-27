import {
  BlueprintDebugResult,
  BlueprintPerson,
  BlueprintProjectOption,
  BlueprintTestResult,
  ChangeBlueprintVersionStatusRequest,
  ConnectorBlueprintDetail,
  ConnectorBlueprintListFilter,
  ConnectorBlueprintSummary,
  CreateConnectorBlueprintRequest,
  DebugBlueprintOperationRequest,
  ImportOpenApiBlueprintRequest,
  OpenApiBlueprintPreview,
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

import { api } from '@/lib/api';

export const connectorBlueprintsApi = {
  list(
    filter: ConnectorBlueprintListFilter,
  ): Promise<ConnectorBlueprintSummary[]> {
    return api.get<ConnectorBlueprintSummary[]>('/v1/connector-blueprints', {
      filter,
    });
  },
  get(id: string): Promise<ConnectorBlueprintDetail> {
    return api.get<ConnectorBlueprintDetail>(`/v1/connector-blueprints/${id}`);
  },
  create(
    request: CreateConnectorBlueprintRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      '/v1/connector-blueprints',
      request,
    );
  },
  previewOpenApi(
    request: PreviewOpenApiBlueprintRequest,
  ): Promise<OpenApiBlueprintPreview> {
    return api.post<OpenApiBlueprintPreview>(
      '/v1/connector-blueprints/openapi/preview',
      request,
    );
  },
  importOpenApi(
    request: ImportOpenApiBlueprintRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      '/v1/connector-blueprints/openapi/import',
      request,
    );
  },
  update(
    id: string,
    request: UpdateConnectorBlueprintRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      `/v1/connector-blueprints/${id}`,
      request,
    );
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/connector-blueprints/${id}`);
  },
  updateCollaborators(
    id: string,
    request: UpdateBlueprintCollaboratorsRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      `/v1/connector-blueprints/${id}/collaborators`,
      request,
    );
  },
  transferOwnership(
    id: string,
    request: TransferBlueprintOwnershipRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      `/v1/connector-blueprints/${id}/owner`,
      request,
    );
  },
  candidates(id: string): Promise<BlueprintPerson[]> {
    return api.get<BlueprintPerson[]>(
      `/v1/connector-blueprints/${id}/candidates`,
    );
  },
  projects(id: string): Promise<BlueprintProjectOption[]> {
    return api.get<BlueprintProjectOption[]>(
      `/v1/connector-blueprints/${id}/projects`,
    );
  },
  saveAuthTestData(
    id: string,
    request: SaveBlueprintAuthTestDataRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      `/v1/connector-blueprints/${id}/auth/test-data`,
      request,
    );
  },
  runAuthTest(
    id: string,
    request: RunBlueprintAuthTestRequest,
  ): Promise<BlueprintTestResult> {
    return api.post<BlueprintTestResult>(
      `/v1/connector-blueprints/${id}/auth/test`,
      request,
    );
  },
  publishAuth(id: string): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      `/v1/connector-blueprints/${id}/auth/publish`,
    );
  },
  debug(
    id: string,
    request: DebugBlueprintOperationRequest,
  ): Promise<BlueprintDebugResult> {
    return api.post<BlueprintDebugResult>(
      `/v1/connector-blueprints/${id}/debug`,
      request,
    );
  },
  saveDebugRecord(
    id: string,
    request: SaveBlueprintDebugRecordRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      `/v1/connector-blueprints/${id}/debug-records`,
      request,
    );
  },
  publish(
    id: string,
    request: PublishConnectorBlueprintRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      `/v1/connector-blueprints/${id}/publish`,
      request,
    );
  },
  changeVersionStatus(
    id: string,
    versionId: string,
    request: ChangeBlueprintVersionStatusRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      `/v1/connector-blueprints/${id}/versions/${versionId}/status`,
      request,
    );
  },
  updateCanary(
    id: string,
    versionId: string,
    request: UpdateBlueprintCanaryRequest,
  ): Promise<ConnectorBlueprintDetail> {
    return api.post<ConnectorBlueprintDetail>(
      `/v1/connector-blueprints/${id}/versions/${versionId}/canary`,
      request,
    );
  },
};
