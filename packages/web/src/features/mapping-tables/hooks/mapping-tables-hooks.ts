import { UpsertMappingTableRequestBody } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { mappingTablesApi } from '../api/mapping-tables-api';

function useMappingTables(projectId: string | null, showErrorDialog = false) {
  return useQuery({
    queryKey: [MAPPING_TABLES_KEY, 'list', projectId],
    queryFn: () => mappingTablesApi.list(projectId!),
    enabled: !!projectId,
    meta: showErrorDialog
      ? { showErrorDialog: true, loadSubsetOptions: {} }
      : undefined,
  });
}

function useMappingTable(id: string | null) {
  return useQuery({
    queryKey: [MAPPING_TABLES_KEY, 'one', id],
    queryFn: () => mappingTablesApi.get(id!),
    enabled: !!id,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useMappingTablesData(ids: string[]) {
  return useQuery({
    queryKey: [MAPPING_TABLES_KEY, 'many', [...ids].sort()],
    queryFn: () => Promise.all(ids.map((id) => mappingTablesApi.get(id))),
    enabled: ids.length > 0,
  });
}

function useReferences(id: string | null) {
  return useQuery({
    queryKey: [MAPPING_TABLES_KEY, 'references', id],
    queryFn: () => mappingTablesApi.references(id!),
    enabled: !!id,
  });
}

function useSaveMappingTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string | null;
      request: UpsertMappingTableRequestBody;
    }) =>
      id === null
        ? mappingTablesApi.create(request)
        : mappingTablesApi.update(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MAPPING_TABLES_KEY] });
      toast.success(t('Mapping table saved'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useDeleteMappingTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mappingTablesApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MAPPING_TABLES_KEY] });
      toast.success(t('Mapping table deleted'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

const MAPPING_TABLES_KEY = 'mapping-tables';

export const mappingTablesHooks = {
  useMappingTables,
  useMappingTable,
  useMappingTablesData,
  useReferences,
  useSaveMappingTable,
  useDeleteMappingTable,
};
