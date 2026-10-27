import {
  MappingTableSummary,
  UpsertMappingTableRequestBody,
} from '@fema-ipaas/shared';
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

function useTableCoverage(id: string | null) {
  return useQuery({
    queryKey: [MAPPING_TABLES_KEY, 'coverage', 'table', id],
    queryFn: () => mappingTablesApi.coverageOfTable(id!),
    enabled: !!id,
  });
}

function useWorkflowCoverage({
  projectId,
  workflowId,
  enabled,
}: {
  projectId: string | null;
  workflowId: string | null;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: [MAPPING_TABLES_KEY, 'coverage', 'workflow', workflowId],
    queryFn: () =>
      mappingTablesApi.coverageOfWorkflow({
        projectId: projectId!,
        workflowId: workflowId!,
      }),
    enabled: enabled && !!projectId && !!workflowId,
  });
}

function useAddRows() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mappingTablesApi.addRows,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [MAPPING_TABLES_KEY] });
      toast.success(t('Added to the mapping table'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
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
    onSuccess: (_, id) => {
      queryClient.setQueriesData<MappingTableSummary[]>(
        { queryKey: [MAPPING_TABLES_KEY, 'list'] },
        (tables) => tables?.filter((table) => table.id !== id),
      );
      void queryClient.invalidateQueries({
        queryKey: [MAPPING_TABLES_KEY],
        predicate: (query) => !query.queryKey.includes(id),
      });
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
  useTableCoverage,
  useWorkflowCoverage,
  useAddRows,
  useSaveMappingTable,
  useDeleteMappingTable,
};
