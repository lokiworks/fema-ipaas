import { SeekPage } from '@fema-ipaas/core-utils';
import {
  GetWorkflowTemplateRequestQuery,
  CreateWorkflowRequest,
  WorkflowOperationRequest,
  WorkflowVersion,
  WorkflowVersionMetadata,
  GetWorkflowQueryParamsRequest,
  ListWorkflowVersionRequest,
  ListWorkflowsRequest,
  PopulatedWorkflow,
  SharedTemplate,
  CountWorkflowsRequest,
} from '@fema-ipaas/shared';
import { toast } from 'sonner';

import { UNSAVED_CHANGES_TOAST } from '@/components/ui/sonner';
import { api } from '@/lib/api';

export const workflowsApi = {
  list(request: ListWorkflowsRequest): Promise<SeekPage<PopulatedWorkflow>> {
    return api.get<SeekPage<PopulatedWorkflow>>('/v1/workflows', request);
  },
  create(request: CreateWorkflowRequest) {
    return api.post<PopulatedWorkflow>('/v1/workflows', request);
  },
  update(
    workflowId: string,
    request: WorkflowOperationRequest,
    showErrorToast = false,
  ) {
    return api
      .post<PopulatedWorkflow>(`/v1/workflows/${workflowId}`, request)
      .catch((error) => {
        if (showErrorToast) {
          toast.error(UNSAVED_CHANGES_TOAST.title, {
            description: UNSAVED_CHANGES_TOAST.description,
            duration: UNSAVED_CHANGES_TOAST.duration,
            id: UNSAVED_CHANGES_TOAST.id,
          });
        }
        throw error;
      });
  },
  getTemplate(workflowId: string, request: GetWorkflowTemplateRequestQuery) {
    return api.get<SharedTemplate>(`/v1/workflows/${workflowId}/template`, {
      params: request,
    });
  },
  get(
    workflowId: string,
    request?: GetWorkflowQueryParamsRequest,
  ): Promise<PopulatedWorkflow> {
    return api.get<PopulatedWorkflow>(`/v1/workflows/${workflowId}`, request);
  },
  listVersions(
    workflowId: string,
    request: ListWorkflowVersionRequest,
  ): Promise<SeekPage<WorkflowVersionMetadata>> {
    return api.get<SeekPage<WorkflowVersion>>(
      `/v1/workflows/${workflowId}/versions`,
      request,
    );
  },
  delete(workflowId: string) {
    return api.delete<void>(`/v1/workflows/${workflowId}`);
  },
  count(query: CountWorkflowsRequest) {
    return api.get<number>('/v1/workflows/count', query);
  },
};
