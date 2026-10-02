import {
  BatchDeleteResponse,
  BatchMoveRequestBody,
  BatchPublishCheckResponse,
  BatchPublishRequestBody,
  BatchPublishResponse,
  CopyProjectRequestBody,
  CopyProjectResponse,
  CopyWorkflowRequestBody,
  CreateFolderRequest,
  FolderDto,
  ImportWorkflowFileRequestBody,
  PopulatedWorkflow,
  ProjectOverviewStats,
  ProjectResourceCounts,
  ProjectTree,
  ProjectWithLimits,
  SaveProjectInfoRequestBody,
  WorkflowBatchRequestBody,
  WorkflowExportFile,
  WorkflowOperationRequest,
  WorkflowTransferResult,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';
import { timezoneUtils } from '@/lib/timezone-utils';

export const projectWorkspaceApi = {
  tree(projectId: string): Promise<ProjectTree> {
    return api.get<ProjectTree>('/v1/project-workspace/tree', { projectId });
  },
  stats(projectId: string): Promise<ProjectOverviewStats> {
    return api.get<ProjectOverviewStats>('/v1/project-workspace/stats', {
      projectId,
      timezone: timezoneUtils.browser(),
    });
  },
  publishCheck(
    request: WorkflowBatchRequestBody,
  ): Promise<BatchPublishCheckResponse> {
    return api.post<BatchPublishCheckResponse>(
      '/v1/project-workspace/batch/publish-check',
      request,
    );
  },
  publish(request: BatchPublishRequestBody): Promise<BatchPublishResponse> {
    return api.post<BatchPublishResponse>(
      '/v1/project-workspace/batch/publish',
      request,
    );
  },
  move(request: BatchMoveRequestBody): Promise<{ moved: number }> {
    return api.post<{ moved: number }>(
      '/v1/project-workspace/batch/move',
      request,
    );
  },
  deleteMany(request: WorkflowBatchRequestBody): Promise<BatchDeleteResponse> {
    return api.delete<BatchDeleteResponse>(
      '/v1/project-workspace/batch',
      undefined,
      request,
    );
  },
  exportWorkflow(workflowId: string): Promise<WorkflowExportFile> {
    return api.get<WorkflowExportFile>(
      `/v1/project-workspace/workflows/${workflowId}/export`,
    );
  },
  importWorkflow(
    request: ImportWorkflowFileRequestBody,
  ): Promise<WorkflowTransferResult> {
    return api.post<WorkflowTransferResult>(
      '/v1/project-workspace/workflows/import',
      request,
    );
  },
  copyWorkflow({
    workflowId,
    request,
  }: {
    workflowId: string;
    request: CopyWorkflowRequestBody;
  }): Promise<WorkflowTransferResult> {
    return api.post<WorkflowTransferResult>(
      `/v1/project-workspace/workflows/${workflowId}/copy`,
      request,
    );
  },
  updateWorkflow({
    workflowId,
    request,
  }: {
    workflowId: string;
    request: WorkflowOperationRequest;
  }): Promise<PopulatedWorkflow> {
    return api.post<PopulatedWorkflow>(`/v1/workflows/${workflowId}`, request);
  },
  createFolder(request: CreateFolderRequest): Promise<FolderDto> {
    return api.post<FolderDto>('/v1/folders', request);
  },
  renameFolder({
    folderId,
    displayName,
  }: {
    folderId: string;
    displayName: string;
  }): Promise<FolderDto> {
    return api.post<FolderDto>(`/v1/folders/${folderId}`, { displayName });
  },
  deleteFolder(folderId: string): Promise<void> {
    return api.delete<void>(`/v1/folders/${folderId}`);
  },
  saveProjectInfo({
    projectId,
    request,
  }: {
    projectId: string;
    request: SaveProjectInfoRequestBody;
  }): Promise<ProjectWithLimits> {
    return api.post<ProjectWithLimits>(
      `/v1/projects/${projectId}/info`,
      request,
    );
  },
  resourceCounts(projectId: string): Promise<ProjectResourceCounts> {
    return api.get<ProjectResourceCounts>(
      `/v1/projects/${projectId}/resource-counts`,
    );
  },
  copyProject({
    projectId,
    request,
  }: {
    projectId: string;
    request: CopyProjectRequestBody;
  }): Promise<CopyProjectResponse> {
    return api.post<CopyProjectResponse>(
      `/v1/projects/${projectId}/copy`,
      request,
    );
  },
  deleteProject(projectId: string): Promise<void> {
    return api.delete<void>(`/v1/projects/${projectId}`);
  },
};
