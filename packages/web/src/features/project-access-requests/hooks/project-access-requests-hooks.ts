import {
  CreateProjectAccessRequestBody,
  DefaultProjectRole,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { HOME_SUMMARY_QUERY_KEY } from '@/features/home/api/home-api';
import { api } from '@/lib/api';

import { projectAccessRequestsApi } from '../api/project-access-requests-api';
import { projectAccessRequestUtils } from '../utils/project-access-request-utils';

function showError(error: unknown): void {
  toast.error(api.extractServerErrorMessage(error, t('Something went wrong')));
}

function useMyPendingProjectIds() {
  const { data } = useQuery({
    queryKey: projectAccessRequestKeys.mine,
    queryFn: () => projectAccessRequestsApi.listMine(),
    staleTime: 30 * 1000,
  });
  return projectAccessRequestUtils.pendingProjectIds(data);
}

function useRequestAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateProjectAccessRequestBody) =>
      projectAccessRequestsApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectAccessRequestKeys.mine,
      });
      toast.success(t('projectAccessSubmitted'));
    },
    onError: showError,
  });
}

function usePendingRequests({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: projectAccessRequestKeys.pending(projectId),
    queryFn: () => projectAccessRequestsApi.listPending(projectId),
    enabled,
  });
}

function useDecideRequest({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve, role }: DecideInput) =>
      approve
        ? projectAccessRequestsApi.approve({ id, request: { role } })
        : projectAccessRequestsApi.reject(id),
    onSuccess: (_request, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectAccessRequestKeys.pending(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ['project-members', projectId],
      });
      queryClient.invalidateQueries({ queryKey: [HOME_SUMMARY_QUERY_KEY] });
      toast.success(
        projectAccessRequestUtils.decidedMessage({
          name: variables.name,
          approve: variables.approve,
        }),
      );
    },
    onError: showError,
  });
}

export const projectAccessRequestsHooks = {
  useMyPendingProjectIds,
  useRequestAccess,
  usePendingRequests,
  useDecideRequest,
};

const projectAccessRequestKeys = {
  mine: ['project-access-requests', 'mine'],
  pending: (projectId: string) => [
    'project-access-requests',
    'pending',
    projectId,
  ],
};

type DecideInput = {
  id: string;
  name: string;
  approve: boolean;
  role?: DefaultProjectRole;
};
