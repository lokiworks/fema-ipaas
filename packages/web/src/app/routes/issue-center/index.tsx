import {
  IssueKind,
  IssueOverviewItem,
  IssueOverviewProject,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Link2, Siren, Workflow } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { CenteredPage } from '@/app/components/centered-page';
import { AlertSettings } from '@/app/routes/tenant/alerts';
import { FormattedDate } from '@/components/custom/formatted-date';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  IssueSeverityBadge,
  IssueStatusBadge,
  issuesHooks,
  issueUiUtils,
} from '@/features/issues';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';
import { cn } from '@/lib/utils';

export function IssueCenterPage() {
  const isTenantAdmin = useIsTenantAdmin();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab =
    requestedTab === ALERTS_TAB && isTenantAdmin ? ALERTS_TAB : ISSUES_TAB;

  return (
    <CenteredPage
      title={t('Issues')}
      description={t(
        'Failed production runs from every project you can see, grouped by cause. Start here when something breaks.',
      )}
      widthClassName="max-w-[72rem]"
    >
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSearchParams(value === ISSUES_TAB ? {} : { tab: value })
        }
      >
        <TabsList>
          <TabsTrigger value={ISSUES_TAB}>{t('Unresolved issues')}</TabsTrigger>
          {isTenantAdmin && (
            <TabsTrigger value={ALERTS_TAB}>{t('Alert settings')}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value={ISSUES_TAB}>
          <UnresolvedIssues />
        </TabsContent>
        {isTenantAdmin && (
          <TabsContent value={ALERTS_TAB}>
            <AlertSettings />
          </TabsContent>
        )}
      </Tabs>
    </CenteredPage>
  );
}

function UnresolvedIssues() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProjectId = searchParams.get('project');
  const { data: overview, isLoading } = issuesHooks.useOverview({
    showErrorDialog: true,
  });

  if (isLoading || !overview) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (overview.projects.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 py-10 text-muted-foreground">
        <Siren className="size-10" />
        <span className="text-sm font-medium text-foreground">
          {t('No unresolved issues')}
        </span>
        <span className="text-sm">
          {t('Production failures show up here, grouped by cause.')}
        </span>
      </div>
    );
  }

  const issues = overview.latest.filter(
    (issue) => !selectedProjectId || issue.projectId === selectedProjectId,
  );
  const toggleProject = (projectId: string) =>
    setSearchParams(
      projectId === selectedProjectId ? {} : { project: projectId },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {overview.projects.map((project) => (
          <ProjectChip
            key={project.projectId}
            project={project}
            selected={project.projectId === selectedProjectId}
            onClick={() => toggleProject(project.projectId)}
          />
        ))}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Issue')}</TableHead>
            <TableHead>{t('Project')}</TableHead>
            <TableHead>{t('Impact')}</TableHead>
            <TableHead>{t('Last seen')}</TableHead>
            <TableHead>{t('Status')}</TableHead>
            <TableHead>{t('Severity')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow
              key={issue.id}
              className="cursor-pointer"
              onClick={() =>
                navigate(`/projects/${issue.projectId}/issues/${issue.id}`)
              }
            >
              <TableCell className="max-w-[28rem]">
                <IssueTitle issue={issue} />
              </TableCell>
              <TableCell className="text-sm">
                {issue.projectDisplayName}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {t('{runs} runs · {workflows} workflows', {
                  runs: issue.occurrences,
                  workflows: issue.affectedWorkflows,
                })}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                <FormattedDate date={new Date(issue.lastSeenAt)} />
              </TableCell>
              <TableCell>
                <IssueStatusBadge
                  status={issue.status}
                  reopened={issue.reopened}
                  muted={false}
                />
              </TableCell>
              <TableCell>
                <IssueSeverityBadge severity={issue.severity} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {overview.latest.length >= LATEST_LIMIT && (
        <span className="text-xs text-muted-foreground">
          {t(
            'Showing the {count} most recent issues. Open a project to see all of its issues.',
            { count: LATEST_LIMIT },
          )}
        </span>
      )}
    </div>
  );
}

function ProjectChip({
  project,
  selected,
  onClick,
}: {
  project: IssueOverviewProject;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent',
        selected && 'border-primary bg-accent',
      )}
    >
      <span className="font-medium">{project.projectDisplayName}</span>
      <span className="text-muted-foreground">
        {t('{open} open', { open: project.open })}
      </span>
      {project.openHighSeverity > 0 && (
        <Badge variant="destructive">
          {t('{count} high', { count: project.openHighSeverity })}
        </Badge>
      )}
      {project.investigating > 0 && (
        <span className="text-muted-foreground">
          {t('{count} investigating', { count: project.investigating })}
        </span>
      )}
    </button>
  );
}

function IssueTitle({ issue }: { issue: IssueOverviewItem }) {
  const detail =
    issue.kind === IssueKind.CONNECTION
      ? t('Connection issue')
      : [issue.workflowDisplayName, issue.stepDisplayName]
          .filter(Boolean)
          .join(' · ');
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="mt-0.5 shrink-0 text-muted-foreground">
        {issue.kind === IssueKind.CONNECTION ? (
          <Link2 className="size-4" />
        ) : (
          <Workflow className="size-4" />
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <TextWithTooltip tooltipMessage={issueUiUtils.issueTitle(issue)}>
          <span className="truncate text-sm font-medium">
            {issueUiUtils.issueTitle(issue)}
          </span>
        </TextWithTooltip>
        <span className="truncate text-xs text-muted-foreground">
          {detail}
          {issue.errorCode ? ` · ${issue.errorCode}` : ''}
        </span>
      </div>
    </div>
  );
}

const ISSUES_TAB = 'issues';
const ALERTS_TAB = 'alerts';
const LATEST_LIMIT = 50;
