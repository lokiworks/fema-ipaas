import { PayloadLevel, RawViewRole } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ShieldCheck, Trash2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { formatUtils } from '@/lib/format-utils';

import { privacyHooks } from '../hooks/privacy-hooks';

export function PurgeEstimateNotice() {
  const { data: overview, isLoading } = privacyHooks.useOverview();
  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (!overview) {
    return null;
  }
  const { purge } = overview;
  const rows = [
    {
      key: 'rawStates',
      label: t('Unmasked run states'),
      count: purge.rawStates,
    },
    {
      key: 'webhookPayloads',
      label: t('Original webhook request bodies'),
      count: purge.webhookPayloads,
    },
    {
      key: 'runIdentifiers',
      label: t('Business keys and failure messages of expired runs'),
      count: purge.runIdentifiers,
    },
    { key: 'logFiles', label: t('Expired log files'), count: purge.logFiles },
  ];
  return (
    <div
      className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3"
      data-testid="purge-estimate"
    >
      <div className="flex items-start gap-2 text-sm">
        <Trash2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          {t(
            'The next cleanup runs at {time}. Based on the saved settings it will delete the following. Deleted data cannot be recovered.',
            {
              time: formatUtils.formatRelativeDayWithTime(
                new Date(purge.nextRunAt),
              ),
            },
          )}
        </span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 pl-6 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right font-medium tabular-nums">
              {row.count.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SensitiveNodesNotice() {
  const { data: overview } = privacyHooks.useOverview();
  if (!overview) {
    return null;
  }
  const workflows = overview.sensitiveWorkflows;
  const nodeCount = workflows.reduce(
    (sum, workflow) => sum + workflow.steps.length,
    0,
  );
  return (
    <div
      className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3"
      data-testid="sensitive-nodes"
    >
      <div className="flex items-start gap-2 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          {nodeCount === 0
            ? t(
                'No node marks its output as sensitive yet. Turn on "Output contains sensitive information" in the Output tab of a step.',
              )
            : t(
                '{count} nodes mark their output as sensitive. All of their output is masked, and the same values are masked in later steps:',
                { count: nodeCount },
              )}
        </span>
      </div>
      {nodeCount > 0 && (
        <ul className="flex flex-col gap-1 pl-6 text-sm">
          {workflows.flatMap((workflow) =>
            workflow.steps.map((step) => (
              <li key={`${workflow.workflowId}:${step.name}`}>
                <Link
                  className="text-primary underline"
                  to={`/projects/${workflow.projectId}/workflows/${workflow.workflowId}`}
                >
                  {workflow.displayName} · {step.displayName}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {workflow.projectDisplayName}
                </span>
              </li>
            )),
          )}
        </ul>
      )}
    </div>
  );
}

export function RawViewersNotice({
  payloadLevel,
}: {
  payloadLevel: PayloadLevel;
}) {
  const { data: overview } = privacyHooks.useOverview();
  if (!overview) {
    return null;
  }
  const viewers = overview.rawViewers;
  const message = !overview.rawViewersRecorded
    ? t(
        'Originals are not recorded at the saved level, so nobody can view them.',
      )
    : viewers.length === 0
    ? t(
        'Nobody can view originals now. Troubleshooting only shows masked data.',
      )
    : t('{count} people can view originals now:', { count: viewers.length });
  return (
    <div
      className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3"
      data-testid="raw-viewers"
    >
      <div className="flex items-start gap-2 text-sm">
        <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>{message}</span>
      </div>
      {viewers.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pl-6 text-sm">
          {viewers.map((viewer) => (
            <li key={viewer.userId} title={viewer.email}>
              {viewer.name.length > 0 ? viewer.name : viewer.email}
              <span className="ml-1 text-xs text-muted-foreground">
                {roleLabel(viewer.role)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {payloadLevel !== PayloadLevel.FULL && overview.rawViewersRecorded && (
        <span className="pl-6 text-xs text-muted-foreground">
          {t(
            'You changed what is recorded. This list follows the saved settings until you save.',
          )}
        </span>
      )}
    </div>
  );
}

function roleLabel(role: RawViewRole): string {
  switch (role) {
    case RawViewRole.OWNER:
      return t('Owner');
    case RawViewRole.ADMIN:
      return t('Admins');
    case RawViewRole.MEMBER:
      return t('Members');
  }
}
