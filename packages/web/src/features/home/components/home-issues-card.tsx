import { IssueSeverity } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { CircleCheck, Siren } from 'lucide-react';
import { Link } from 'react-router-dom';

import { issuesHooks, issueUiUtils } from '@/features/issues';
import { formatUtils } from '@/lib/format-utils';

import { SideCard, SideRow } from './side-card';

export function HomeIssuesCard() {
  const { data: overview } = issuesHooks.useOverview({
    showErrorDialog: false,
  });
  const projects = overview?.projects ?? [];
  const unresolved = projects.reduce(
    (total, project) => total + project.open + project.investigating,
    0,
  );
  const highSeverity = projects.reduce(
    (total, project) => total + project.openHighSeverity,
    0,
  );
  const latest = (overview?.latest ?? []).slice(0, HOME_ISSUE_LIMIT);

  return (
    <SideCard
      title={t('Unresolved issues')}
      description={
        unresolved === 0
          ? t('All good')
          : highSeverity > 0
          ? t('{count} unresolved, {high} high severity', {
              count: unresolved,
              high: highSeverity,
            })
          : t('{count} unresolved', { count: unresolved })
      }
      action={
        <Link
          to="/issue-center"
          className="shrink-0 text-xs text-primary hover:underline"
        >
          {t('View all')}
        </Link>
      }
    >
      <div className="flex flex-col gap-0.5">
        {latest.map((issue) => (
          <SideRow
            key={issue.id}
            icon={Siren}
            iconClassName={
              issue.severity === IssueSeverity.HIGH ? 'text-destructive' : ''
            }
            title={issueUiUtils.issueTitle(issue)}
            subtitle={`${issue.projectDisplayName} · ${formatUtils.formatDate(
              new Date(issue.lastSeenAt),
            )}`}
            to={`/projects/${issue.projectId}/issues/${issue.id}`}
          />
        ))}
        {unresolved === 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-success" />
            {t('No production failures waiting for you')}
          </div>
        )}
      </div>
    </SideCard>
  );
}

const HOME_ISSUE_LIMIT = 5;
