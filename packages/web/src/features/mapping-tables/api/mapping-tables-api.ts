import { MappingCoverageSource } from '@fema-ipaas/core-utils';
import {
  MappingTable,
  MappingTableReference,
  MappingTableRow,
  MappingTableSummary,
  UpsertMappingTableRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const mappingTablesApi = {
  list(projectId: string): Promise<MappingTableSummary[]> {
    return api.get<MappingTableSummary[]>('/v1/mapping-tables', { projectId });
  },
  get(id: string): Promise<MappingTable> {
    return api.get<MappingTable>(`/v1/mapping-tables/${id}`);
  },
  create(request: UpsertMappingTableRequestBody): Promise<MappingTable> {
    return api.post<MappingTable>('/v1/mapping-tables', request);
  },
  update(
    id: string,
    request: UpsertMappingTableRequestBody,
  ): Promise<MappingTable> {
    return api.post<MappingTable>(`/v1/mapping-tables/${id}`, request);
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/mapping-tables/${id}`);
  },
  coverageOfTable(id: string): Promise<MappingCoverageSource[]> {
    return api.get<MappingCoverageSource[]>(
      `/v1/mapping-tables/${id}/coverage`,
    );
  },
  coverageOfWorkflow({
    projectId,
    workflowId,
  }: {
    projectId: string;
    workflowId: string;
  }): Promise<MappingCoverageSource[]> {
    return api.get<MappingCoverageSource[]>('/v1/mapping-tables/coverage', {
      projectId,
      workflowId,
    });
  },
  addRows({
    id,
    rows,
  }: {
    id: string;
    rows: MappingTableRow[];
  }): Promise<MappingTable> {
    return api.post<MappingTable>(`/v1/mapping-tables/${id}/rows`, { rows });
  },
  references(id: string): Promise<MappingTableReference[]> {
    return api.get<MappingTableReference[]>(
      `/v1/mapping-tables/${id}/references`,
    );
  },
};
