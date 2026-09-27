import {
  AiModelConnection,
  AiUsageSummary,
  ApplyWorkflowPlanRequestBody,
  ApplyWorkflowPlanResponse,
  CopilotRequestBody,
  CopilotResponse,
  GenerateWorkflowPlanRequestBody,
  ListAiUsageRequestQuery,
  WorkflowPlan,
  SuggestFieldMappingRequestBody,
  SuggestFieldMappingResponse,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const aiApi = {
  listModelConnections(projectId: string): Promise<AiModelConnection[]> {
    return api.get<AiModelConnection[]>('/v1/ai/model-connections', {
      projectId,
    });
  },
  generatePlan(
    request: GenerateWorkflowPlanRequestBody,
  ): Promise<WorkflowPlan> {
    return api.post<WorkflowPlan>('/v1/ai/workflow-plans', request);
  },
  applyPlan(
    request: ApplyWorkflowPlanRequestBody,
  ): Promise<ApplyWorkflowPlanResponse> {
    return api.post<ApplyWorkflowPlanResponse>(
      '/v1/ai/workflow-plans/apply',
      request,
    );
  },
  suggestFieldMapping(
    request: SuggestFieldMappingRequestBody,
  ): Promise<SuggestFieldMappingResponse> {
    return api.post<SuggestFieldMappingResponse>(
      '/v1/ai/field-mapping',
      request,
    );
  },
  copilot(request: CopilotRequestBody): Promise<CopilotResponse> {
    return api.post<CopilotResponse>('/v1/ai/copilot', request);
  },
  usage(request: ListAiUsageRequestQuery): Promise<AiUsageSummary> {
    return api.get<AiUsageSummary>('/v1/ai/usage', request);
  },
};
