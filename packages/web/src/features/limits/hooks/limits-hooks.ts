import { UpdateProjectLimitsRequestBody } from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { limitsApi } from '../api/limits-api';

function useInstanceLimits() {
  return useQuery({
    queryKey: [LIMITS_KEY, 'instance'],
    queryFn: () => limitsApi.instance(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useProjectLimits() {
  return useQuery({
    queryKey: [LIMITS_KEY, 'projects'],
    queryFn: () => limitsApi.projects(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useProjectUsage(projectId: string) {
  return useQuery({
    queryKey: [LIMITS_KEY, 'project-usage', projectId],
    queryFn: () => limitsApi.projectUsage(projectId),
  });
}

function useUpdateProjectLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      request,
    }: {
      projectId: string;
      request: UpdateProjectLimitsRequestBody;
    }) => limitsApi.updateProject({ projectId, request }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [LIMITS_KEY] });
      toast.success(t('Limits saved'));
    },
  });
}

export const limitsHooks = {
  useInstanceLimits,
  useProjectLimits,
  useProjectUsage,
  useUpdateProjectLimits,
};

const LIMITS_KEY = 'limits';
