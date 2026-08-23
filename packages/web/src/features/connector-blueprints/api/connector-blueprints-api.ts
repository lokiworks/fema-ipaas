import {
  ConnectorBlueprint,
  GenerateFromBlueprintResponse,
  SeekPage,
  UpsertConnectorBlueprintRequest,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const connectorBlueprintsApi = {
  list(): Promise<SeekPage<ConnectorBlueprint>> {
    return api.get<SeekPage<ConnectorBlueprint>>('/v1/connector-blueprints');
  },
  get(id: string): Promise<ConnectorBlueprint> {
    return api.get<ConnectorBlueprint>(`/v1/connector-blueprints/${id}`);
  },
  upsert(
    request: UpsertConnectorBlueprintRequest,
  ): Promise<ConnectorBlueprint> {
    return api.post<ConnectorBlueprint>('/v1/connector-blueprints', request);
  },
  generate(id: string): Promise<GenerateFromBlueprintResponse> {
    return api.post<GenerateFromBlueprintResponse>(
      `/v1/connector-blueprints/${id}/generate`,
      {},
    );
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/connector-blueprints/${id}`);
  },
};
