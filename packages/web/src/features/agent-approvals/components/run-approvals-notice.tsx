import { authenticationSession } from '@/lib/authentication-session';

import { agentApprovalsHooks } from '../hooks/agent-approvals-hooks';

import { ApprovalCard } from './approval-card';

export function RunApprovalsNotice({
  executionId,
  stepName,
  enabled,
}: {
  executionId: string;
  stepName: string;
  enabled: boolean;
}) {
  const projectId = authenticationSession.getProjectId() ?? '';
  const { data } = agentApprovalsHooks.useApprovals({
    query: { projectId, executionId },
    enabled: enabled && projectId.length > 0,
    primary: false,
  });
  const approvals = (data ?? []).filter(
    (approval) => approval.stepName === stepName,
  );
  if (approvals.length === 0) {
    return null;
  }
  return (
    <div className="mb-3 flex flex-col gap-2">
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          showRunLink={false}
        />
      ))}
    </div>
  );
}
