import {
  ApproveWorkflowReleaseRequestBody,
  CreateWorkflowReleaseRequestBody,
  DeployToTestRequestBody,
  ListWorkflowReleasesRequestQuery,
  RejectWorkflowReleaseRequestBody,
  RollbackWorkflowRequestBody,
  UpdateEnvironmentSettingsRequestBody,
  UpsertConnectionReplacementRequestBody,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { projectCollectionUtils } from '@/features/projects';
import { api } from '@/lib/api';

import { releasesApi } from '../api/releases-api';

function useReleases(request: ListWorkflowReleasesRequestQuery) {
  return useQuery({
    queryKey: [RELEASES_KEY, 'list', request],
    queryFn: () => releasesApi.list(request),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function usePendingCount(projectId: string | null) {
  return useQuery({
    queryKey: [RELEASES_KEY, 'pending-count', projectId],
    queryFn: () => releasesApi.pendingCount(projectId!),
    enabled: !!projectId,
  });
}

function useRelease(id: string) {
  return useQuery({
    queryKey: [RELEASES_KEY, 'one', id],
    queryFn: () => releasesApi.get(id),
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useCreateRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateWorkflowReleaseRequestBody) =>
      releasesApi.create(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RELEASES_KEY] });
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useApprove(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ApproveWorkflowReleaseRequestBody) =>
      releasesApi.approve(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RELEASES_KEY] });
      toast.success(t('Release approved and published'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useReject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RejectWorkflowReleaseRequestBody) =>
      releasesApi.reject(id, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RELEASES_KEY] });
      toast.success(t('Release rejected'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useWithdraw(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => releasesApi.withdraw(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RELEASES_KEY] });
      toast.success(t('Release withdrawn'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useReplacements(projectId: string) {
  return useQuery({
    queryKey: [RELEASES_KEY, 'replacements', projectId],
    queryFn: () => releasesApi.listReplacements(projectId),
  });
}

function useUpsertReplacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertConnectionReplacementRequestBody) =>
      releasesApi.upsertReplacement(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [RELEASES_KEY, 'replacements'],
      });
      toast.success(t('Test connection saved'));
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useDeleteReplacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => releasesApi.deleteReplacement(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [RELEASES_KEY, 'replacements'],
      });
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useEnvironments({
  projectId,
  enabled,
  showErrorDialog,
}: {
  projectId: string;
  enabled: boolean;
  showErrorDialog: boolean;
}) {
  return useQuery({
    queryKey: [RELEASES_KEY, 'environments', projectId],
    queryFn: () => releasesApi.environments(projectId),
    enabled,
    meta: showErrorDialog
      ? { showErrorDialog: true, loadSubsetOptions: {} }
      : undefined,
  });
}

function useUpdateEnvironments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpdateEnvironmentSettingsRequestBody) =>
      releasesApi.updateEnvironments(request),
    onSuccess: async (overview, request) => {
      queryClient.setQueryData(
        [RELEASES_KEY, 'environments', request.projectId],
        overview,
      );
      void queryClient.invalidateQueries({ queryKey: [RELEASES_KEY] });
      await projectCollectionUtils.refetchProjects();
    },
  });
}

function useDeployToTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: DeployToTestRequestBody) =>
      releasesApi.deployToTest(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [RELEASES_KEY] });
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

function useRollback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RollbackWorkflowRequestBody) =>
      releasesApi.rollback(request),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: [RELEASES_KEY] });
      void queryClient.invalidateQueries({
        queryKey: ['workflow-versions', result.workflowId],
      });
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

const RELEASES_KEY = 'workflow-releases';

export const releasesHooks = {
  useReleases,
  usePendingCount,
  useRelease,
  useCreateRelease,
  useApprove,
  useReject,
  useWithdraw,
  useReplacements,
  useUpsertReplacement,
  useDeleteReplacement,
  useEnvironments,
  useUpdateEnvironments,
  useDeployToTest,
  useRollback,
};
