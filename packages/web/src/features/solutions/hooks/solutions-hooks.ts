import { isNil } from '@fema-ipaas/core-utils';
import { SolutionCheckResults, SolutionInstallInput } from '@fema-ipaas/shared';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { connectionsApi } from '@/features/connections/api/connections';
import { workflowsApi } from '@/features/workflows/api/workflows-api';
import { api } from '@/lib/api';

import { solutionsApi } from '../api/solutions-api';
import { solutionsUtils } from '../utils/solutions-utils';

function useSolutions() {
  return useQuery({
    queryKey: [SOLUTIONS_KEY, 'list'],
    queryFn: () => solutionsApi.list(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useSolution(id: string) {
  return useQuery({
    queryKey: [SOLUTIONS_KEY, 'one', id],
    queryFn: () => solutionsApi.get(id),
  });
}

function useInstalls() {
  return useQuery({
    queryKey: [SOLUTIONS_KEY, 'installs'],
    queryFn: () => solutionsApi.listInstalls(),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useSlotConnections({
  projectId,
  connectorNames,
}: {
  projectId: string;
  connectorNames: string[];
}) {
  return useQueries({
    queries: connectorNames.map((connectorName) => ({
      queryKey: ['connections', SOLUTIONS_KEY, projectId, connectorName],
      queryFn: () =>
        connectionsApi.list({ projectId, connectorName, limit: 1000 }),
      staleTime: 0,
    })),
    combine: (results) => ({
      isLoading: results.some((result) => result.isLoading),
      byConnector: Object.fromEntries(
        connectorNames.map((connectorName, index) => [
          connectorName,
          results[index]?.data?.data ?? [],
        ]),
      ),
    }),
  });
}

function usePublishedWorkflows(projectId: string) {
  return useQuery({
    queryKey: [SOLUTIONS_KEY, 'published-workflows', projectId],
    queryFn: async () => {
      const page = await workflowsApi.list({
        projectId,
        limit: 1000,
        cursor: undefined,
      });
      return page.data.filter(
        (workflow) => !isNil(workflow.publishedVersionId),
      );
    },
    enabled: projectId.length > 0,
  });
}

function useInstallPreview({
  id,
  request,
}: {
  id: string;
  request: SolutionInstallInput;
}) {
  return useQuery({
    queryKey: [SOLUTIONS_KEY, 'preview', id, request],
    queryFn: () => solutionsApi.preview({ id, request }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

function useInstallChecks({
  id,
  projectId,
  connections,
}: {
  id: string;
  projectId: string;
  connections: Record<string, string>;
}) {
  return useQuery({
    queryKey: [SOLUTIONS_KEY, 'checks', id, projectId, connections],
    queryFn: () =>
      solutionsApi.runChecks({ id, request: { projectId, connections } }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

function useRecheckOne({
  id,
  projectId,
  connections,
}: {
  id: string;
  projectId: string;
  connections: Record<string, string>;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (checkKey: string) =>
      solutionsApi.runChecks({
        id,
        request: { projectId, connections, checkKey },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<SolutionCheckResults>(
        [SOLUTIONS_KEY, 'checks', id, projectId, connections],
        (current) =>
          current
            ? solutionsUtils.mergeCheckResults({
                current: current.results,
                updated: updated.results,
              })
            : updated,
      );
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useCreateFromProject({
  onSuccess,
}: {
  onSuccess: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: solutionsApi.createFromProject,
    onSuccess: (solution) => {
      void queryClient.invalidateQueries({ queryKey: [SOLUTIONS_KEY] });
      toast.success(t('Solution created'));
      onSuccess(solution.id);
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function usePublishVersion({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: solutionsApi.publishVersion,
    onSuccess: (solution) => {
      void queryClient.invalidateQueries({ queryKey: [SOLUTIONS_KEY] });
      toast.success(
        t('Version {version} published', { version: solution.currentVersion }),
      );
      onSuccess();
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useUpgradeInstall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: solutionsApi.upgrade,
    onSuccess: (install) => {
      void queryClient.invalidateQueries({ queryKey: [SOLUTIONS_KEY] });
      toast.success(
        t(
          'Upgraded to version {version}. The changes are in the workflow drafts: test them, then publish',
          { version: install.version },
        ),
      );
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useInstall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: solutionsApi.install,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SOLUTIONS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

const SOLUTIONS_KEY = 'solutions';

export const solutionsHooks = {
  useSolutions,
  useSolution,
  useInstalls,
  useSlotConnections,
  usePublishedWorkflows,
  useInstallPreview,
  useInstallChecks,
  useRecheckOne,
  useCreateFromProject,
  usePublishVersion,
  useUpgradeInstall,
  useInstall,
};
