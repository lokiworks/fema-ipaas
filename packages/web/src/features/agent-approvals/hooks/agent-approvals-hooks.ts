import {
  AgentApprovalStatus,
  DecideAgentApprovalRequestBody,
  ListAgentApprovalsRequestQuery,
} from '@fema-ipaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';

import { api } from '@/lib/api';

import { agentApprovalsApi } from '../api/agent-approvals-api';

function useApprovals({
  query,
  enabled,
  primary,
}: {
  query: ListAgentApprovalsRequestQuery;
  enabled: boolean;
  primary: boolean;
}) {
  return useQuery({
    queryKey: [APPROVALS_KEY, query],
    queryFn: () => agentApprovalsApi.list(query),
    enabled,
    ...(primary
      ? { meta: { showErrorDialog: true, loadSubsetOptions: {} } }
      : {}),
  });
}

function useDecide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: DecideAgentApprovalRequestBody;
    }) => agentApprovalsApi.decide({ id, request }),
    onSuccess: (approval) => {
      queryClient.invalidateQueries({ queryKey: [APPROVALS_KEY] });
      toast.success(
        approval.status === AgentApprovalStatus.APPROVED
          ? t('Approved. The run continues.')
          : t('Rejected. The agent continues without this call.'),
      );
    },
    onError: (error) =>
      toast.error(
        api.extractServerErrorMessage(error, t('Something went wrong')),
      ),
  });
}

const APPROVALS_KEY = 'agent-approvals';

export const agentApprovalsHooks = {
  useApprovals,
  useDecide,
};
