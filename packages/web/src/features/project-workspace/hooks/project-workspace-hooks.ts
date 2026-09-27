import {
  BatchMoveRequestBody,
  BatchPublishRequestBody,
  CopyProjectRequestBody,
  CopyWorkflowRequestBody,
  CreateFolderRequest,
  ImportWorkflowFileRequestBody,
  SaveProjectInfoRequestBody,
  WorkflowBatchRequestBody,
  WorkflowOperationRequest,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { projectCollectionUtils } from '@/features/projects/stores/project-collection';
import { PROJECT_DIRECTORY_QUERY_KEY } from '@/features/projects/api/project-directory-api';
import { api } from '@/lib/api';

import { projectWorkspaceApi } from '../api/project-workspace-api';

function showError(error: unknown) {
  toast.error(t(api.extractServerErrorMessage(error, 'Something went wrong')));
}

function useInvalidateWorkspace() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [WORKSPACE_KEY] });
    void queryClient.invalidateQueries({ queryKey: PROJECT_DIRECTORY_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['folders'] });
    void queryClient.invalidateQueries({ queryKey: ['workflows'] });
  };
}

function useTree(projectId: string | null) {
  return useQuery({
    queryKey: [WORKSPACE_KEY, 'tree', projectId],
    queryFn: () => projectWorkspaceApi.tree(projectId!),
    enabled: !!projectId,
  });
}

function useStats(projectId: string | null) {
  return useQuery({
    queryKey: [WORKSPACE_KEY, 'stats', projectId],
    queryFn: () => projectWorkspaceApi.stats(projectId!),
    enabled: !!projectId,
    meta: { showErrorDialog: true, loadSubsetOptions: {} },
  });
}

function useResourceCounts({
  projectId,
  enabled,
}: {
  projectId: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: [WORKSPACE_KEY, 'resource-counts', projectId],
    queryFn: () => projectWorkspaceApi.resourceCounts(projectId),
    enabled,
  });
}

function usePublishCheck() {
  return useMutation({
    mutationFn: (request: WorkflowBatchRequestBody) =>
      projectWorkspaceApi.publishCheck(request),
    onError: showError,
  });
}

function useBatchPublish() {
  const invalidate = useInvalidateWorkspace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BatchPublishRequestBody) =>
      projectWorkspaceApi.publish(request),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['releases'] });
    },
    onError: showError,
  });
}

function useMoveWorkflows() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (request: BatchMoveRequestBody) =>
      projectWorkspaceApi.move(request),
    onSuccess: invalidate,
    onError: showError,
  });
}

function useDeleteWorkflows() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (request: WorkflowBatchRequestBody) =>
      projectWorkspaceApi.deleteMany(request),
    onSuccess: invalidate,
    onError: showError,
  });
}

function useImportWorkflow() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (request: ImportWorkflowFileRequestBody) =>
      projectWorkspaceApi.importWorkflow(request),
    onSuccess: invalidate,
  });
}

function useCopyWorkflow() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({
      workflowId,
      request,
    }: {
      workflowId: string;
      request: CopyWorkflowRequestBody;
    }) => projectWorkspaceApi.copyWorkflow({ workflowId, request }),
    onSuccess: invalidate,
    onError: showError,
  });
}

function useUpdateWorkflow() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({
      workflowId,
      request,
    }: {
      workflowId: string;
      request: WorkflowOperationRequest;
    }) => projectWorkspaceApi.updateWorkflow({ workflowId, request }),
    onSuccess: invalidate,
    onError: showError,
  });
}

function useCreateFolder() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (request: CreateFolderRequest) =>
      projectWorkspaceApi.createFolder(request),
    onSuccess: invalidate,
  });
}

function useRenameFolder() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({
      folderId,
      displayName,
    }: {
      folderId: string;
      displayName: string;
    }) => projectWorkspaceApi.renameFolder({ folderId, displayName }),
    onSuccess: invalidate,
  });
}

function useDeleteFolder() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (folderId: string) => projectWorkspaceApi.deleteFolder(folderId),
    onSuccess: () => {
      invalidate();
      toast.success(t('Folder deleted'));
    },
    onError: showError,
  });
}

function useSaveProjectInfo() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({
      projectId,
      request,
    }: {
      projectId: string;
      request: SaveProjectInfoRequestBody;
    }) => projectWorkspaceApi.saveProjectInfo({ projectId, request }),
    onSuccess: async () => {
      invalidate();
      await projectCollectionUtils.refetchProjects();
    },
  });
}

function useCopyProject() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: ({
      projectId,
      request,
    }: {
      projectId: string;
      request: CopyProjectRequestBody;
    }) => projectWorkspaceApi.copyProject({ projectId, request }),
    onSuccess: async () => {
      invalidate();
      await projectCollectionUtils.refetchProjects();
    },
    onError: showError,
  });
}

function useDeleteProject() {
  const invalidate = useInvalidateWorkspace();
  return useMutation({
    mutationFn: (projectId: string) =>
      projectWorkspaceApi.deleteProject(projectId),
    onSuccess: async () => {
      invalidate();
      await projectCollectionUtils.refetchProjects();
    },
    onError: showError,
  });
}

export const projectWorkspaceHooks = {
  useTree,
  useStats,
  useResourceCounts,
  usePublishCheck,
  useBatchPublish,
  useMoveWorkflows,
  useDeleteWorkflows,
  useImportWorkflow,
  useCopyWorkflow,
  useUpdateWorkflow,
  useCreateFolder,
  useRenameFolder,
  useDeleteFolder,
  useSaveProjectInfo,
  useCopyProject,
  useDeleteProject,
  useInvalidateWorkspace,
};

export const WORKSPACE_KEY = 'project-workspace';
