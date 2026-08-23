import { isNil, SeekPage } from '@fema/core-utils';
import {
  CreatePlatformWorkspaceRequest,
  ListWorkspaceRequestForPlatformQueryParams,
  UpdateWorkspacePlatformRequest,
  WorkspaceType,
  WorkspaceWithLimits,
  WorkspaceWithLimitsWithPlatform,
} from '@fema/shared';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import {
  and,
  createCollection,
  eq,
  like,
  or,
  useLiveSuspenseQuery,
} from '@tanstack/react-db';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { useEmbedding } from '@/components/providers/embed-provider';
import { api } from '@/lib/api';
import { authenticationSession } from '@/lib/authentication-session';

const collectionQueryClient = new QueryClient();

export const workspaceCollection = createCollection<
  WorkspaceWithLimits,
  string
>(
  queryCollectionOptions({
    queryKey: ['workspaces'],
    queryClient: collectionQueryClient,
    queryFn: async () => {
      const request: ListWorkspaceRequestForPlatformQueryParams = {
        cursor: undefined,
        limit: 30000,
      };
      const response = await api.get<SeekPage<WorkspaceWithLimits>>(
        '/v1/workspaces',
        request,
      );
      return response.data;
    },
    getKey: (item) => item.id,
    onUpdate: async ({ transaction }) => {
      for (const { original, modified } of transaction.mutations) {
        // Only send fields that actually changed, so e.g. a name/icon edit never
        // re-writes maxConcurrentJobs/workerGroupId (which are edited elsewhere).
        const request: UpdateWorkspacePlatformRequest = {};
        if (modified.displayName !== original.displayName) {
          request.displayName = modified.displayName;
        }
        if (modified.metadata !== original.metadata) {
          request.metadata = modified.metadata ?? undefined;
        }
        if (modified.releasesEnabled !== original.releasesEnabled) {
          request.releasesEnabled = modified.releasesEnabled;
        }
        if (
          modified.notifyWorkflowOwnerOnFailure !==
          original.notifyWorkflowOwnerOnFailure
        ) {
          request.notifyWorkflowOwnerOnFailure =
            modified.notifyWorkflowOwnerOnFailure;
        }
        if (modified.externalId !== original.externalId) {
          request.externalId =
            !isNil(modified.externalId) && modified.externalId.trim() !== ''
              ? modified.externalId
              : undefined;
        }
        if (modified.icon !== original.icon) {
          request.icon = modified.icon;
        }
        if (modified.maxConcurrentJobs !== original.maxConcurrentJobs) {
          request.maxConcurrentJobs = modified.maxConcurrentJobs;
        }
        if (modified.workerGroupId !== original.workerGroupId) {
          request.workerGroupId = modified.workerGroupId;
        }
        if (Object.keys(request).length === 0) {
          continue;
        }
        await api.post<WorkspaceWithLimits>(
          `/v1/workspaces/${original.id}`,
          request,
        );
      }
    },
    onInsert: async ({ transaction }) => {
      for (const { modified } of transaction.mutations) {
        await api.post<WorkspaceWithLimits>('/v1/workspaces', modified);
      }
    },
    onDelete: async ({ transaction }) => {
      for (const { original } of transaction.mutations) {
        await api.delete<void>(`/v1/workspaces/${original.id}`);
      }
    },
  }),
);

export const workspaceCollectionUtils = {
  useCreateWorkspace: (
    onSuccess: (workspace: WorkspaceWithLimits) => void,
    onError: (error: Error) => void,
  ) => {
    return useMutation({
      mutationFn: (request: CreatePlatformWorkspaceRequest) =>
        api.post<WorkspaceWithLimits>('/v1/workspaces', request),
      onSuccess: async (data) => {
        await workspaceCollection.preload();
        workspaceCollection.utils.writeInsert(data);
        onSuccess(data);
      },
      onError: (error) => {
        onError(error);
      },
    });
  },
  useUpdateWorkspace: (
    onSuccess: () => void,
    onError: (error: Error) => void,
  ) => {
    return useMutation({
      mutationFn: ({
        workspaceId,
        request,
      }: {
        workspaceId: string;
        request: UpdateWorkspacePlatformRequest;
      }) =>
        api.post<WorkspaceWithLimits>(`/v1/workspaces/${workspaceId}`, request),
      onSuccess: async (data) => {
        await workspaceCollection.preload();
        workspaceCollection.utils.writeUpdate(data);
        onSuccess();
      },
      onError,
    });
  },
  update: (workspaceId: string, request: UpdateWorkspacePlatformRequest) => {
    return workspaceCollection.update(workspaceId, (draft) => {
      Object.assign(
        draft,
        Object.fromEntries(
          Object.entries(request).filter(([_, value]) => value !== undefined),
        ),
      );
    });
  },
  delete: (workspaceIds: string[]) => {
    workspaceCollection.delete(workspaceIds);
  },
  refetchWorkspaces: () => workspaceCollection.utils.refetch(),
  setCurrentWorkspace: (workspaceId: string, pathName?: string) => {
    authenticationSession.switchToWorkspace(workspaceId);
    if (pathName) {
      const pathNameWithNewWorkspaceId = pathName.replace(
        /\/workspaces\/\w+/,
        `/workspaces/${workspaceId}`,
      );
      window.location.href = pathNameWithNewWorkspaceId;
    }
  },
  useCurrentWorkspace: () => {
    const workspaceId = authenticationSession.getWorkspaceId();
    const { data } = useLiveSuspenseQuery(
      (q) =>
        q
          .from({ workspace: workspaceCollection })
          .where(({ workspace }) => eq(workspace.id, workspaceId))
          .select(({ workspace }) => ({ ...workspace }))
          .findOne(),
      [workspaceId],
    );
    return {
      workspace: data!,
    };
  },
  useAll: () => {
    const currentUserId = authenticationSession.getCurrentUserId();
    return useLiveSuspenseQuery(
      (q) =>
        q
          .from({ workspace: workspaceCollection })
          .where(({ workspace }) =>
            or(
              eq(workspace.type, WorkspaceType.TEAM),
              and(
                eq(workspace.type, WorkspaceType.PERSONAL),
                eq(workspace.ownerId, currentUserId),
              ),
            ),
          )
          .orderBy(({ workspace }) => workspace.type, 'asc')
          .orderBy(({ workspace }) => workspace.created, 'asc')
          .select(({ workspace }) => ({ ...workspace })),
      [currentUserId],
    );
  },
  useAllPlatformWorkspaces: (filters?: {
    displayName?: string;
    type?: WorkspaceType[];
  }) => {
    return useLiveSuspenseQuery(
      (q) => {
        let query = q.from({ workspace: workspaceCollection });

        if (filters?.displayName) {
          query = query.where(({ workspace }) =>
            like(workspace.displayName, `%${filters.displayName}%`),
          );
        }

        if (filters?.type && filters.type.length > 0) {
          query = query.where(({ workspace }) => {
            const types = filters.type!;
            if (types.length === 1) {
              return eq(workspace.type, types[0]);
            }
            const conditions = types.map((t) => eq(workspace.type, t)) as [
              any,
              any,
              ...any[],
            ];
            return or(...conditions);
          });
        }

        return query
          .orderBy(({ workspace }) => workspace.type, 'asc')
          .orderBy(({ workspace }) => workspace.created, 'asc')
          .select(({ workspace }) => ({ ...workspace }));
      },
      [filters?.displayName, filters?.type?.join(',')],
    );
  },
  useHasAccessToWorkspace: (workspaceId: string) => {
    const { data } = useLiveSuspenseQuery((q) =>
      q
        .from({ workspace: workspaceCollection })
        .where(({ workspace }) => eq(workspace.id, workspaceId))
        .select(({ workspace }) => ({ ...workspace }))
        .findOne(),
    );
    return !isNil(data);
  },
};

export const getWorkspaceName = (
  workspace: Pick<WorkspaceWithLimits, 'type' | 'displayName'>,
): string => {
  return workspace.type === WorkspaceType.PERSONAL
    ? 'Personal Workspace'
    : workspace.displayName;
};
export const workspaceHooks = {
  useWorkspacesForPlatforms: () => {
    return useQuery<WorkspaceWithLimitsWithPlatform[], Error>({
      queryKey: ['workspaces-for-platforms'],
      queryFn: async () => {
        return api.get<WorkspaceWithLimitsWithPlatform[]>('/v1/platforms');
      },
    });
  },
  useReloadPageIfWorkspaceIdChanged: (workspaceId: string) => {
    const { embedState } = useEmbedding();
    const location = useLocation();
    useEffect(() => {
      const handleVisibilityChange = () => {
        const currentWorkspaceId = authenticationSession.getWorkspaceId();
        const isTemplateRoute = location.pathname.startsWith('/templates');
        if (
          currentWorkspaceId !== workspaceId &&
          document.visibilityState === 'visible' &&
          !embedState.isEmbedded &&
          !isTemplateRoute
        ) {
          window.location.reload();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange,
        );
      };
    }, [workspaceId, embedState.isEmbedded, location.pathname]);
  },
};
