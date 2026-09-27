import { ProjectDirectoryItem, ProjectOverviewStats } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { UserAvatar } from '@/components/custom/user-avatar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { limitsHooks } from '@/features/limits';
import { projectMembersHooks } from '@/features/project-members/hooks/project-members-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { formatUtils } from '@/lib/format-utils';

import { WorkspaceContext } from '../hooks/use-workspace-context';
import { projectRoleLabels } from '../lib/role-labels';

export function OverviewSideCards({
  context,
  stats,
  directoryItem,
  onShare,
}: {
  context: WorkspaceContext;
  stats: ProjectOverviewStats | undefined;
  directoryItem: ProjectDirectoryItem | undefined;
  onShare: () => void;
}) {
  const navigate = useNavigate();
  const { project, permissions, workflows, releasesEnabled } = context;
  const { data: membersPage } = projectMembersHooks.useMembers();
  const members = membersPage?.data ?? [];
  const me = authenticationSession.getCurrentUserId();
  const workflowsLimit = context.workflowsLimit;
  const { data: limitsUsage } = limitsHooks.useProjectUsage(project.id);
  const runsLimit =
    limitsUsage?.monthlyRuns.limit ?? project.monthlyRunsLimit ?? null;
  const monthRuns = limitsUsage?.monthlyRuns.used ?? stats?.runs.thisMonth ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <Card
        title={t('Project members')}
        action={
          permissions.canEdit ? (
            <Button type="button" variant="ghost" size="xs" onClick={onShare}>
              <UserPlus />
              {t('Share')}
            </Button>
          ) : null
        }
      >
        <div className="flex flex-col gap-2">
          {members.slice(0, MEMBERS_SHOWN).map((member) => {
            const name =
              `${member.user.firstName ?? ''} ${
                member.user.lastName ?? ''
              }`.trim() || member.user.email;
            return (
              <div key={member.id} className="flex items-center gap-2 text-sm">
                <UserAvatar
                  name={name}
                  email={member.user.email}
                  size={24}
                  disableTooltip
                />
                <span className="min-w-0 flex-1 truncate">
                  {name}
                  {member.userId === me ? ` ${t('(you)')}` : ''}
                </span>
                <span className="text-xs text-muted-foreground">
                  {projectRoleLabels.label(member.role)}
                </span>
              </div>
            );
          })}
          {members.length === 0 && (
            <span className="text-sm text-muted-foreground">
              {t('No members yet')}
            </span>
          )}
          {members.length > MEMBERS_SHOWN && (
            <Button
              type="button"
              variant="link"
              size="xs"
              className="self-start px-0"
              onClick={onShare}
            >
              {t('View all {count} members', { count: members.length })}
            </Button>
          )}
        </div>
      </Card>
      <Card title={t('Project info')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('Owner')}</dt>
          <dd className="truncate">{directoryItem?.ownerName ?? '—'}</dd>
          <dt className="text-muted-foreground">{t('My access')}</dt>
          <dd>{projectRoleLabels.label(context.role)}</dd>
          <dt className="text-muted-foreground">{t('Environments')}</dt>
          <dd>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto px-0"
              onClick={() => navigate(`/projects/${project.id}/releases`)}
            >
              {releasesEnabled ? t('Test + production') : t('Production only')}
            </Button>
          </dd>
          <dt className="text-muted-foreground">{t('Created')}</dt>
          <dd>{formatUtils.formatDateOnly(new Date(project.created))}</dd>
          <dt className="text-muted-foreground">{t('Project ID')}</dt>
          <dd className="truncate font-mono text-xs">{project.id}</dd>
        </dl>
        <div className="mt-4 flex flex-col gap-3 border-t pt-4">
          <LimitRow
            label={t('Workflows {used} / {limit}', {
              used: workflows.length,
              limit:
                workflowsLimit === null
                  ? t('Unlimited')
                  : formatUtils.formatNumber(workflowsLimit),
            })}
            used={workflows.length}
            limit={workflowsLimit}
          />
          <LimitRow
            label={t('Runs this month {used} / {limit}', {
              used: formatUtils.formatNumber(monthRuns),
              limit:
                runsLimit === null
                  ? t('Unlimited')
                  : formatUtils.formatNumber(runsLimit),
            })}
            used={monthRuns}
            limit={runsLimit}
          />
          <span className="text-xs text-muted-foreground">
            {t('Limits are set by platform administrators')}
          </span>
        </div>
      </Card>
    </div>
  );
}

function LimitRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {limit !== null && limit > 0 && (
        <Progress value={Math.min(100, (used / limit) * 100)} />
      )}
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const MEMBERS_SHOWN = 6;
