import {
  CreateDataStoreRequestBody,
  UpdateDataStoreRequestBody,
  UpsertDataStoreRecordRequestBody,
} from '@fema-ipaas/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { dataStoresApi } from '../api/data-stores-api';

function useDataStores(projectId: string) {
  return useQuery({
    queryKey: [DATA_STORES_KEY, 'list', projectId],
    queryFn: () => dataStoresApi.list(projectId),
    enabled: projectId.length > 0,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useRecords({ id, search }: { id: string; search: string }) {
  return useQuery({
    queryKey: [DATA_STORES_KEY, 'records', id, search],
    queryFn: () => dataStoresApi.listRecords({ id, search }),
    placeholderData: keepPreviousData,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useCreateDataStore({ onError }: { onError: (error: Error) => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateDataStoreRequestBody) =>
      dataStoresApi.create(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DATA_STORES_KEY] });
      toast.success(t('Data store created'));
    },
    onError,
  });
}

function useUpdateDataStore({ onError }: { onError: (error: Error) => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: UpdateDataStoreRequestBody;
    }) => dataStoresApi.update({ id, request }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DATA_STORES_KEY] });
      toast.success(t('Saved'));
    },
    onError,
  });
}

function useDeleteDataStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dataStoresApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DATA_STORES_KEY] });
      toast.success(t('Data store deleted'));
    },
    onError: showErrorToast,
  });
}

function useClearDataStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dataStoresApi.clear(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DATA_STORES_KEY] });
      toast.success(t('Data store cleared'));
    },
    onError: showErrorToast,
  });
}

function useUpsertRecord({ onError }: { onError: (error: Error) => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: UpsertDataStoreRecordRequestBody;
    }) => dataStoresApi.upsertRecord({ id, request }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DATA_STORES_KEY] });
    },
    onError,
  });
}

function useDeleteRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) =>
      dataStoresApi.deleteRecord({ id, key }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DATA_STORES_KEY] });
      toast.success(t('Record deleted'));
    },
    onError: showErrorToast,
  });
}

function showErrorToast(error: Error): void {
  toast.error(
    t(api.extractServerErrorMessage(error, t('Something went wrong'))),
  );
}

const DATA_STORES_KEY = 'data-stores';

export const dataStoresHooks = {
  useDataStores,
  useRecords,
  useCreateDataStore,
  useUpdateDataStore,
  useDeleteDataStore,
  useClearDataStore,
  useUpsertRecord,
  useDeleteRecord,
};
