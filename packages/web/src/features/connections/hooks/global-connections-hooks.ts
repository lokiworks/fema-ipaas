import {
  ConnectionWithoutSensitiveData,
  ListGlobalConnectionsRequestQuery,
} from '@fema/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { internalErrorToast } from '@/components/ui/sonner';
import { tenantHooks } from '@/hooks/tenant-hooks';

import { globalConnectionsApi } from '../api/global-connections';
import {
  NoWorkspaceSelected,
  ConnectionNameAlreadyExists,
  isConnectionNameUnique,
} from '../utils/utils';

type UseGlobalConnectionsProps = {
  request: ListGlobalConnectionsRequestQuery;
  extraKeys: any[];
  staleTime?: number;
  gcTime?: number;
  showErrorDialog?: boolean;
};

const GLOBAL_CONNECTIONS_QUERY_KEY = 'globalConnections';
export const globalConnectionsQueries = {
  getGlobalConnectionsQueryKey: (extraKeys: string[]) => [
    GLOBAL_CONNECTIONS_QUERY_KEY,
    ...extraKeys,
  ],
  useGlobalConnections: ({
    request,
    extraKeys,
    staleTime,
    gcTime,
    showErrorDialog,
  }: UseGlobalConnectionsProps) => {
    const { tenant } = tenantHooks.useCurrentTenant();
    return useQuery({
      queryKey: [GLOBAL_CONNECTIONS_QUERY_KEY, ...extraKeys],
      staleTime,
      gcTime,
      enabled: tenant.plan.globalConnectionsEnabled,
      meta: showErrorDialog
        ? { showErrorDialog: true, loadSubsetOptions: {} }
        : undefined,
      queryFn: () => {
        return globalConnectionsApi.list(request);
      },
    });
  },
};

export const globalConnectionsMutations = {
  useBulkDeleteGlobalConnections: (refetch: () => void) =>
    useMutation({
      mutationFn: async (ids: string[]) => {
        await Promise.all(ids.map((id) => globalConnectionsApi.delete(id)));
      },
      onSuccess: () => {
        refetch();
      },
      onError: () => {
        internalErrorToast();
      },
    }),
  useUpdateGlobalConnection: (
    refetch: () => void,
    setIsOpen: (isOpen: boolean) => void,
    editConnectionForm: UseFormReturn<{
      displayName: string;
      workspaceIds: string[];
      preSelectForNewWorkspaces: boolean;
    }>,
  ) =>
    useMutation<
      ConnectionWithoutSensitiveData,
      Error,
      {
        connectionId: string;
        displayName: string;
        workspaceIds: string[];
        preSelectForNewWorkspaces: boolean;
        currentName: string;
      }
    >({
      mutationFn: async ({
        connectionId,
        displayName,
        workspaceIds,
        preSelectForNewWorkspaces,
        currentName,
      }) => {
        if (
          !(await isConnectionNameUnique({
            isGlobalConnection: true,
            displayName,
          })) &&
          displayName !== currentName
        ) {
          throw new ConnectionNameAlreadyExists();
        }
        if (workspaceIds.length === 0) {
          throw new NoWorkspaceSelected();
        }
        return globalConnectionsApi.update(connectionId, {
          displayName,
          workspaceIds,
          preSelectForNewWorkspaces,
        });
      },
      onSuccess: () => {
        refetch();
        toast.success(t('Connection has been updated.'), {
          duration: 3000,
        });
        setIsOpen(false);
      },
      onError: (error) => {
        if (error instanceof ConnectionNameAlreadyExists) {
          editConnectionForm.setError('displayName', {
            message: error.message,
          });
        } else if (error instanceof NoWorkspaceSelected) {
          editConnectionForm.setError('workspaceIds', {
            message: error.message,
          });
        } else {
          internalErrorToast();
        }
      },
    }),
};
