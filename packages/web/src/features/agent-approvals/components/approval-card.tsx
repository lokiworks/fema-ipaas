import {
  AgentApprovalStatus,
  AgentApprovalWithWorkflow,
} from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { authenticationSession } from '@/lib/authentication-session';

import { agentApprovalsHooks } from '../hooks/agent-approvals-hooks';

export function ApprovalCard({
  approval,
  showRunLink,
}: {
  approval: AgentApprovalWithWorkflow;
  showRunLink: boolean;
}) {
  const { mutate: decide, isPending } = agentApprovalsHooks.useDecide();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const pending = approval.status === AgentApprovalStatus.PENDING;
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{approval.tool}</span>
        <Badge variant={statusVariant(approval.status)}>
          {statusLabel(approval.status)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {approval.workflowDisplayName} · {approval.stepName}
        </span>
        {showRunLink && (
          <Link
            className="ml-auto text-xs underline"
            to={authenticationSession.appendProjectRoutePrefix(
              `/runs/${approval.executionId}`,
            )}
          >
            {t('Open run')}
          </Link>
        )}
      </div>
      {approval.message.length > 0 && (
        <p className="text-sm">{approval.message}</p>
      )}
      <pre className="max-h-48 overflow-auto rounded bg-muted/50 p-2 text-xs">
        {JSON.stringify(approval.arguments, null, 2)}
      </pre>
      <span className="text-xs text-muted-foreground">
        {pending
          ? t('Rejected automatically if nobody decides by {time}', {
              time: dayjs(approval.expiresAt).format('YYYY-MM-DD HH:mm'),
            })
          : decisionText(approval)}
      </span>
      {pending && approval.canDecide && !rejecting && (
        <div className="flex gap-2">
          <Button
            size="sm"
            loading={isPending}
            onClick={() =>
              decide({ id: approval.id, request: { approved: true } })
            }
          >
            {t('Approve and continue')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setRejecting(true)}
          >
            {t('Reject')}
          </Button>
        </div>
      )}
      {pending && approval.canDecide && rejecting && (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            maxLength={200}
            value={comment}
            placeholder={t('Why is this call rejected? The agent reads this.')}
            onChange={(event) => setComment(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              loading={isPending}
              disabled={comment.trim().length === 0}
              onClick={() =>
                decide({
                  id: approval.id,
                  request: { approved: false, comment: comment.trim() },
                })
              }
            >
              {t('Reject')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(false)}
            >
              {t('Cancel')}
            </Button>
          </div>
        </div>
      )}
      {pending && !approval.canDecide && (
        <span className="text-xs text-muted-foreground">
          {t('Waiting for the workflow owner or the project owner.')}
        </span>
      )}
    </div>
  );
}

function decisionText(approval: AgentApprovalWithWorkflow): string {
  const time = approval.decidedAt
    ? dayjs(approval.decidedAt).format('YYYY-MM-DD HH:mm')
    : '';
  switch (approval.status) {
    case AgentApprovalStatus.APPROVED:
      return t('Approved at {time}', { time });
    case AgentApprovalStatus.REJECTED:
      return t('Rejected at {time}: {comment}', {
        time,
        comment: approval.comment ?? '',
      });
    case AgentApprovalStatus.EXPIRED:
      return t('Nobody decided in time; the call was rejected at {time}', {
        time,
      });
    case AgentApprovalStatus.PENDING:
      return '';
  }
}

function statusLabel(status: AgentApprovalStatus): string {
  switch (status) {
    case AgentApprovalStatus.PENDING:
      return t('Waiting for approval');
    case AgentApprovalStatus.APPROVED:
      return t('Approved');
    case AgentApprovalStatus.REJECTED:
      return t('Rejected');
    case AgentApprovalStatus.EXPIRED:
      return t('Expired');
  }
}

function statusVariant(
  status: AgentApprovalStatus,
): 'secondary' | 'success' | 'destructive' | 'outline' {
  switch (status) {
    case AgentApprovalStatus.PENDING:
      return 'secondary';
    case AgentApprovalStatus.APPROVED:
      return 'success';
    case AgentApprovalStatus.REJECTED:
      return 'destructive';
    case AgentApprovalStatus.EXPIRED:
      return 'outline';
  }
}
