import {
  getAuthPropertyForValue,
  ConnectorAuthProperty,
} from '@fema-ipaas/connector-sdk';
import {
  ApplicationErrorParams,
  ErrorCode,
  isNil,
  SeekPage,
} from '@fema-ipaas/core-utils';
import {
  AddConnectionSharesRequestBody,
  ConnectionScope,
  ConnectionStatus,
  ConnectionWithoutSensitiveData,
  ListAccessibleConnectionsRequestQuery,
  ListConnectionsRequestQuery,
  PLACEHOLDER_CONNECTION_TYPE,
  ReplaceConnectionsRequestBody,
  UpdateConnectionAccessRequestBody,
  UpdateConnectionShareRequestBody,
  UpsertConnectionRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { tenantUserApi } from '@/api/tenant-user-api';
import {
  CURSOR_QUERY_PARAM,
  LIMIT_QUERY_PARAM,
} from '@/components/custom/data-table';
import { internalErrorToast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

import { connectionsApi } from '../api/connections';
import { globalConnectionsApi } from '../api/global-connections';
import {
  ConnectionNameAlreadyExists,
  NoProjectSelected,
  isConnectionNameUnique,
} from '../utils/utils';

type UseReplaceConnectionsProps = {
  setDialogOpen: (isOpen: boolean) => void;
  refetch: () => void;
};

type UseRenameConnectionProps = {
  currentName: string;
  setIsRenameDialogOpen: (isOpen: boolean) => void;
  renameConnectionForm: UseFormReturn<{
    displayName: string;
  }>;
  refetch: () => void;
};

type UseUpsertConnectionProps = {
  isGlobalConnection: boolean;
  reconnectConnection: ConnectionWithoutSensitiveData | null;
  externalIdComingFromSdk?: string | null;
  setErrorMessage: (message: string) => void;
  form: UseFormReturn<{
    request: UpsertConnectionRequestBody & {
      projectIds: string[];
      preSelectForNewProjects: boolean;
    };
  }>;
  setOpen: (open: boolean, connection?: ConnectionWithoutSensitiveData) => void;
};

export const connectionAccessQueryKeys = {
  accessible: (extraKeys: unknown[]) => [
    'connections-accessible',
    ...extraKeys,
  ],
  detail: (connectionId: string) => ['connection-detail', connectionId],
  accessImpact: (params: {
    connectionId: string;
    allProjects: boolean;
    projectIds: string[];
  }) => [
    'connection-access-impact',
    params.connectionId,
    params.allProjects,
    ...params.projectIds,
  ],
};

export const connectionsMutations = {
  useUpsertConnection: ({
    isGlobalConnection,
    reconnectConnection,
    externalIdComingFromSdk,
    setErrorMessage,
    form,
    setOpen,
  }: UseUpsertConnectionProps) => {
    return useMutation({
      mutationFn: async () => {
        setErrorMessage('');
        const formValues = form.getValues().request;
        const isNameUnique = await isConnectionNameUnique({
          isGlobalConnection,
          displayName: formValues.displayName,
          projectId: formValues.projectId,
        });
        if (
          !isNameUnique &&
          reconnectConnection?.displayName !== formValues.displayName &&
          (isNil(externalIdComingFromSdk) || externalIdComingFromSdk === '')
        ) {
          throw new ConnectionNameAlreadyExists();
        }
        if (isGlobalConnection) {
          if (formValues.projectIds.length === 0) {
            throw new NoProjectSelected();
          }
          if (formValues.type === PLACEHOLDER_CONNECTION_TYPE) {
            throw new Error(
              'Placeholder connections are only supported at the project scope.',
            );
          }
          return globalConnectionsApi.upsert({
            ...formValues,
            projectIds: formValues.projectIds,
            scope: ConnectionScope.TENANT,
          });
        }
        return connectionsApi.upsert(formValues);
      },
      onSuccess: (connection) => {
        setOpen(false, connection);
        setErrorMessage('');
      },
      onError: (err) => {
        if (err instanceof ConnectionNameAlreadyExists) {
          form.setError('request.displayName', {
            message: err.message,
          });
        } else if (err instanceof NoProjectSelected) {
          form.setError('request.projectIds', {
            message: err.message,
          });
        } else if (api.isError(err)) {
          const applicationError = err.response?.data as ApplicationErrorParams;
          switch (applicationError.code) {
            case ErrorCode.INVALID_CLOUD_CLAIM: {
              setErrorMessage(
                t(
                  'Could not claim the authorization code, make sure you have correct settings and try again.',
                ),
              );
              break;
            }
            case ErrorCode.INVALID_CLAIM: {
              setErrorMessage(
                t('Connection failed with error {msg}', {
                  msg: applicationError.params.message,
                }),
              );
              break;
            }
            case ErrorCode.INVALID_CONNECTION: {
              setErrorMessage(
                t('Connection failed with error {msg}', {
                  msg: applicationError.params.error,
                }),
              );
              break;
            }
            // can happen in embedding sdk connect method
            case ErrorCode.PERMISSION_DENIED: {
              setErrorMessage(
                t(`You don't have the permission to create a connection.`),
              );
              break;
            }
            case ErrorCode.SECRET_MANAGER_GET_SECRET_FAILED: {
              setErrorMessage(
                t('Secret was not found: "{msg}"', {
                  msg: applicationError.params.message,
                }),
              );
              break;
            }
            case ErrorCode.SECRET_MANAGER_CONNECTION_FAILED: {
              setErrorMessage(
                t('Failed to connect to secret manager with error: "{msg}"', {
                  msg: applicationError.params.message,
                }),
              );
              break;
            }
            case ErrorCode.VALIDATION: {
              setErrorMessage(
                t('Validation error: {msg}', {
                  msg: applicationError.params.message,
                }),
              );
              break;
            }

            default: {
              setErrorMessage('Unexpected error, please contact support');
              internalErrorToast();
              console.error(err);
            }
          }
        }
      },
    });
  },

  useBulkDeleteConnections: (refetch: () => void) => {
    return useMutation({
      mutationFn: async (ids: string[]) => {
        await Promise.all(ids.map((id) => connectionsApi.delete(id)));
      },
      onSuccess: () => {
        refetch();
      },
      onError: () => {
        internalErrorToast();
      },
    });
  },

  useRenameConnection: ({
    currentName,
    setIsRenameDialogOpen,
    renameConnectionForm,
    refetch,
  }: UseRenameConnectionProps) => {
    return useMutation({
      mutationFn: async ({
        connectionId,
        displayName,
      }: {
        connectionId: string;
        displayName: string;
      }) => {
        const existingConnection = await isConnectionNameUnique({
          isGlobalConnection: false,
          displayName,
        });
        if (!existingConnection && displayName !== currentName) {
          throw new ConnectionNameAlreadyExists();
        }
        return connectionsApi.update(connectionId, { displayName });
      },
      onSuccess: () => {
        refetch();
        toast.success(t('Success'), {
          description: t('Connection has been renamed.'),
          duration: 3000,
        });
        setIsRenameDialogOpen(false);
      },
      onError: (error) => {
        if (error instanceof ConnectionNameAlreadyExists) {
          renameConnectionForm.setError('displayName', {
            message: error.message,
          });
        } else {
          internalErrorToast();
        }
      },
    });
  },

  useRevalidateConnection: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (connectionId: string) =>
        connectionsApi.revalidate(connectionId),
      onSuccess: (connection) => {
        queryClient.setQueriesData<SeekPage<ConnectionWithoutSensitiveData>>(
          { queryKey: ['connections'] },
          (page) =>
            page && {
              ...page,
              data: page.data.map((row) =>
                row.id === connection.id
                  ? { ...row, status: connection.status }
                  : row,
              ),
            },
        );
        if (connection.status === ConnectionStatus.ACTIVE) {
          toast.success(t('Success'), {
            description: t('Connection is working.'),
            duration: 3000,
          });
        } else {
          toast.error(t('Connection failed'), {
            description: t(
              'This connection is no longer working. Reconnect it.',
            ),
            duration: 3000,
          });
        }
      },
      onError: () => {
        internalErrorToast();
      },
    });
  },

  useAddConnectionShares: ({ connectionId }: { connectionId: string }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (request: AddConnectionSharesRequestBody) =>
        connectionsApi.addShares(connectionId, request),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: connectionAccessQueryKeys.detail(connectionId),
        });
        queryClient.invalidateQueries({ queryKey: ['connections-accessible'] });
        toast.success(t('Success'), {
          description: t('Connection shared.'),
          duration: 3000,
        });
      },
      onError: () => {
        internalErrorToast();
      },
    });
  },

  useUpdateConnectionShare: ({ connectionId }: { connectionId: string }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        userId,
        request,
      }: {
        userId: string;
        request: UpdateConnectionShareRequestBody;
      }) => connectionsApi.updateShare(connectionId, userId, request),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: connectionAccessQueryKeys.detail(connectionId),
        });
        queryClient.invalidateQueries({ queryKey: ['connections-accessible'] });
      },
      onError: () => {
        internalErrorToast();
      },
    });
  },

  useRemoveConnectionShare: ({ connectionId }: { connectionId: string }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ userId }: { userId: string }) =>
        connectionsApi.removeShare(connectionId, userId),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: connectionAccessQueryKeys.detail(connectionId),
        });
        queryClient.invalidateQueries({ queryKey: ['connections-accessible'] });
      },
      onError: () => {
        internalErrorToast();
      },
    });
  },

  useUpdateConnectionAccess: ({ connectionId }: { connectionId: string }) => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (request: UpdateConnectionAccessRequestBody) =>
        connectionsApi.updateAccess(connectionId, request),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: connectionAccessQueryKeys.detail(connectionId),
        });
        queryClient.invalidateQueries({ queryKey: ['connections-accessible'] });
        toast.success(t('Success'), {
          description: t('Connection scope updated.'),
          duration: 3000,
        });
      },
      onError: () => {
        internalErrorToast();
      },
    });
  },

  useRemindConnectionOwner: () => {
    return useMutation({
      mutationFn: (connectionId: string) =>
        connectionsApi.remindOwner(connectionId),
      onSuccess: (result) => {
        toast.success(
          result.reminded
            ? t('Reminded {name}', { name: result.ownerDisplayName })
            : t('You already reminded {name} recently', {
                name: result.ownerDisplayName,
              }),
        );
      },
      onError: () => {
        internalErrorToast();
      },
    });
  },

  useDeleteAccessibleConnection: () => {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (connectionId: string) => connectionsApi.delete(connectionId),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['connections-accessible'] });
      },
      onError: () => {
        internalErrorToast();
      },
    });
  },

  useReplaceConnections: ({
    setDialogOpen,
    refetch,
  }: UseReplaceConnectionsProps) => {
    return useMutation({
      mutationFn: async (request: ReplaceConnectionsRequestBody) => {
        await connectionsApi.replace(request);
      },
      onSuccess: () => {
        toast.success(t('Success'), {
          description: t('Connections replaced successfully'),
        });
        setDialogOpen(false);
        refetch();
      },
      onError: (error) => {
        if (api.isError(error)) {
          const applicationError = error.response
            ?.data as ApplicationErrorParams;
          if (
            applicationError?.code === ErrorCode.VALIDATION ||
            applicationError?.code === ErrorCode.AUTHORIZATION
          ) {
            toast.error(t('Error'), {
              description: t(
                applicationError.params.message ??
                  'Failed to replace connections',
              ),
            });
            return;
          }
        }
        toast.error(t('Error'), {
          description: t('Failed to replace connections'),
        });
      },
    });
  },
};

type UseConnectionsProps = {
  request: ListConnectionsRequestQuery;
  extraKeys: any[];
  enabled?: boolean;
  staleTime?: number;
  connectorAuth?: ConnectorAuthProperty | ConnectorAuthProperty[] | undefined;
  showErrorDialog?: boolean;
};

export const connectionsQueries = {
  useConnections: ({
    request,
    extraKeys,
    enabled,
    staleTime,
    connectorAuth,
    showErrorDialog,
  }: UseConnectionsProps) => {
    return useQuery({
      queryKey: ['connections', ...extraKeys],
      meta: showErrorDialog
        ? { showErrorDialog: true, loadSubsetOptions: {} }
        : undefined,
      queryFn: async () => {
        const connections = await connectionsApi.list(request);
        if (connectorAuth) {
          return {
            ...connections,
            data: connections.data.filter(
              (connection) =>
                !isNil(
                  getAuthPropertyForValue({
                    authValueType: connection.type,
                    connectorAuth,
                  }),
                ),
            ),
          };
        }
        return connections;
      },
      enabled,
      staleTime,
    });
  },

  useListSearchParams: () => {
    const { search } = useLocation();
    return useMemo(() => {
      const sp = new URLSearchParams(search);
      const limitParam = sp.get(LIMIT_QUERY_PARAM);
      return {
        cursor: sp.get(CURSOR_QUERY_PARAM) ?? undefined,
        limit: limitParam ? parseInt(limitParam) : 10,
        displayName: sp.get('displayName') ?? undefined,
        ownerEmails: sp.getAll('owner'),
        status: sp.getAll('status') as ConnectionStatus[],
        connectorName: sp.get('connectorName') ?? undefined,
      };
    }, [search]);
  },

  useAccessibleConnections: ({
    request,
    extraKeys,
  }: {
    request: ListAccessibleConnectionsRequestQuery;
    extraKeys: unknown[];
  }) => {
    return useQuery({
      queryKey: connectionAccessQueryKeys.accessible(extraKeys),
      meta: { showErrorDialog: true, loadSubsetOptions: {} },
      queryFn: () => connectionsApi.listAccessible(request),
    });
  },

  useShareCandidates: () => {
    return useQuery({
      queryKey: ['connection-share-candidates'],
      queryFn: () => tenantUserApi.list({ limit: 2000 }),
      staleTime: 60 * 1000,
    });
  },

  useConnectionDetail: ({
    connectionId,
    enabled,
  }: {
    connectionId: string | null;
    enabled?: boolean;
  }) => {
    return useQuery({
      queryKey: connectionAccessQueryKeys.detail(connectionId ?? ''),
      queryFn: () => connectionsApi.getDetail(connectionId!),
      enabled: !isNil(connectionId) && (enabled ?? true),
    });
  },

  useConnectionAccessImpact: ({
    connectionId,
    allProjects,
    projectIds,
    enabled,
  }: {
    connectionId: string;
    allProjects: boolean;
    projectIds: string[];
    enabled: boolean;
  }) => {
    return useQuery({
      queryKey: connectionAccessQueryKeys.accessImpact({
        connectionId,
        allProjects,
        projectIds,
      }),
      queryFn: () =>
        connectionsApi.getAccessImpact(connectionId, {
          allProjects,
          projectIds,
        }),
      enabled,
    });
  },

  useConnectionsOwners: () => {
    const projectId = authenticationSession.getProjectId() ?? '';

    return useQuery({
      queryKey: ['connections-owners', projectId],
      queryFn: async () => {
        const { data: owners } = await connectionsApi.getOwners({
          projectId,
        });
        return owners;
      },
    });
  },
};
