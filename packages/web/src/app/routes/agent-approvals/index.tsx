import { AgentApprovalStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { CenteredPage } from '@/app/components/centered-page';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { agentApprovalsHooks, ApprovalCard } from '@/features/agent-approvals';
import { authenticationSession } from '@/lib/authentication-session';

export function AgentApprovalsPage() {
  const projectId = authenticationSession.getProjectId() ?? '';
  const [view, setView] = useState<'pending' | 'all'>('pending');
  const { data, isLoading } = agentApprovalsHooks.useApprovals({
    query: {
      projectId,
      ...(view === 'pending' ? { status: AgentApprovalStatus.PENDING } : {}),
    },
    enabled: projectId.length > 0,
    primary: true,
  });
  return (
    <CenteredPage
      widthClassName="max-w-[48rem]"
      title={t('Agent approvals')}
      description={t(
        'AI agents pause here before calling tools that change other systems. Approve to let the run continue; reject to make the agent go on without the call.',
      )}
      actions={
        <Tabs
          value={view}
          onValueChange={(value) =>
            setView(value === 'all' ? 'all' : 'pending')
          }
        >
          <TabsList>
            <TabsTrigger value="pending">{t('Waiting')}</TabsTrigger>
            <TabsTrigger value="all">{t('All')}</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {view === 'pending'
            ? t('Nothing is waiting for approval.')
            : t('No agent has asked for approval yet.')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {(data ?? []).map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} showRunLink />
          ))}
        </div>
      )}
    </CenteredPage>
  );
}
