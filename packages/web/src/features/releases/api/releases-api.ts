import { SeekPage } from '@fema-ipaas/core-utils';
import {
  ApproveWorkflowReleaseRequestBody,
  ConnectionReplacement,
  CreateWorkflowReleaseRequestBody,
  DeployToTestRequestBody,
  DeployToTestResponse,
  EnvironmentOverview,
  ListWorkflowReleasesRequestQuery,
  RejectWorkflowReleaseRequestBody,
  RollbackWorkflowRequestBody,
  RollbackWorkflowResponse,
  UpdateEnvironmentSettingsRequestBody,
  UpsertConnectionReplacementRequestBody,
  WorkflowRelease,
  WorkflowReleaseDetail,
  WorkflowReleaseWithWorkflow,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const releasesApi = {
  list(
    request: ListWorkflowReleasesRequestQuery,
  ): Promise<SeekPage<WorkflowReleaseWithWorkflow>> {
    return api.get<SeekPage<WorkflowReleaseWithWorkflow>>(
      '/v1/workflow-releases',
      request,
    );
  },
  pendingCount(projectId: string): Promise<{ count: number }> {
    return api.get<{ count: number }>('/v1/workflow-releases/pending-count', {
      projectId,
    });
  },
  create(request: CreateWorkflowReleaseRequestBody): Promise<WorkflowRelease> {
    return api.post<WorkflowRelease>('/v1/workflow-releases', request);
  },
  get(id: string): Promise<WorkflowReleaseDetail> {
    return api.get<WorkflowReleaseDetail>(`/v1/workflow-releases/${id}`);
  },
  approve(
    id: string,
    request: ApproveWorkflowReleaseRequestBody,
  ): Promise<WorkflowRelease> {
    return api.post<WorkflowRelease>(
      `/v1/workflow-releases/${id}/approve`,
      request,
    );
  },
  reject(
    id: string,
    request: RejectWorkflowReleaseRequestBody,
  ): Promise<WorkflowRelease> {
    return api.post<WorkflowRelease>(
      `/v1/workflow-releases/${id}/reject`,
      request,
    );
  },
  withdraw(id: string): Promise<WorkflowRelease> {
    return api.post<WorkflowRelease>(
      `/v1/workflow-releases/${id}/withdraw`,
      {},
    );
  },
  listReplacements(projectId: string): Promise<ConnectionReplacement[]> {
    return api.get<ConnectionReplacement[]>('/v1/connection-replacements', {
      projectId,
    });
  },
  upsertReplacement(
    request: UpsertConnectionReplacementRequestBody,
  ): Promise<ConnectionReplacement> {
    return api.post<ConnectionReplacement>(
      '/v1/connection-replacements',
      request,
    );
  },
  deleteReplacement(id: string): Promise<void> {
    return api.delete<void>(`/v1/connection-replacements/${id}`);
  },
  environments(projectId: string): Promise<EnvironmentOverview> {
    return api.get<EnvironmentOverview>('/v1/workflow-releases/environments', {
      projectId,
    });
  },
  updateEnvironments(
    request: UpdateEnvironmentSettingsRequestBody,
  ): Promise<EnvironmentOverview> {
    return api.post<EnvironmentOverview>(
      '/v1/workflow-releases/environments',
      request,
    );
  },
  deployToTest(
    request: DeployToTestRequestBody,
  ): Promise<DeployToTestResponse> {
    return api.post<DeployToTestResponse>(
      '/v1/workflow-releases/deploy-to-test',
      request,
    );
  },
  rollback(
    request: RollbackWorkflowRequestBody,
  ): Promise<RollbackWorkflowResponse> {
    return api.post<RollbackWorkflowResponse>(
      '/v1/workflow-releases/rollback',
      request,
    );
  },
};
