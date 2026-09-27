import {
  AgentApproval,
  AgentApprovalWithWorkflow,
  DecideAgentApprovalRequestBody,
  ListAgentApprovalsRequestQuery,
} from '@fema-ipaas/shared';

import { api } from '@/lib/api';

export const agentApprovalsApi = {
  list(
    query: ListAgentApprovalsRequestQuery,
  ): Promise<AgentApprovalWithWorkflow[]> {
    return api.get<AgentApprovalWithWorkflow[]>('/v1/agent-approvals', query);
  },
  pendingCount(projectId: string): Promise<{ count: number }> {
    return api.get<{ count: number }>('/v1/agent-approvals/pending-count', {
      projectId,
    });
  },
  decide({
    id,
    request,
  }: {
    id: string;
    request: DecideAgentApprovalRequestBody;
  }): Promise<AgentApproval> {
    return api.post<AgentApproval>(`/v1/agent-approvals/${id}/decide`, request);
  },
};
