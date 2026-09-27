import {
  CreateDataStoreRequestBody,
  DataStore,
  DataStoreRecord,
  DataStoreRecordsPage,
  DataStoreSummary,
  UpdateDataStoreRequestBody,
  UpsertDataStoreRecordRequestBody,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const dataStoresApi = {
  list(projectId: string): Promise<DataStoreSummary[]> {
    return api.get<DataStoreSummary[]>('/v1/data-stores', { projectId });
  },
  create(request: CreateDataStoreRequestBody): Promise<DataStore> {
    return api.post<DataStore>('/v1/data-stores', request);
  },
  update({
    id,
    request,
  }: {
    id: string;
    request: UpdateDataStoreRequestBody;
  }): Promise<DataStore> {
    return api.post<DataStore>(`/v1/data-stores/${id}`, request);
  },
  delete(id: string): Promise<void> {
    return api.delete<void>(`/v1/data-stores/${id}`);
  },
  listRecords({
    id,
    search,
  }: {
    id: string;
    search: string;
  }): Promise<DataStoreRecordsPage> {
    return api.get<DataStoreRecordsPage>(`/v1/data-stores/${id}/records`, {
      ...(search.length > 0 ? { search } : {}),
    });
  },
  upsertRecord({
    id,
    request,
  }: {
    id: string;
    request: UpsertDataStoreRecordRequestBody;
  }): Promise<DataStoreRecord> {
    return api.post<DataStoreRecord>(`/v1/data-stores/${id}/records`, request);
  },
  deleteRecord({ id, key }: { id: string; key: string }): Promise<void> {
    return api.delete<void>(`/v1/data-stores/${id}/records`, { key });
  },
  clear(id: string): Promise<{ count: number }> {
    return api.post<{ count: number }>(`/v1/data-stores/${id}/clear`, {});
  },
};
