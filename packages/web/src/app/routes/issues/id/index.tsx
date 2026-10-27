import { Permission } from '@fema-ipaas/core-utils';
import {
  AlertRecordKind,
  IssueFixKind,
  IssueInsightCause,
  IssueKind,
  IssueStatus,
  IssueTrendGranularity,
  IssueWithSeverity,
  WorkflowRetryStrategy,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ArrowLeft,
  BellOff,
  CheckCircle2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ExplainedErrorMessage } from '@/components/custom/explained-error-message';
import { FormattedDate } from '@/components/custom/formatted-date';
import { ResourceNotFound } from '@/components/custom/resource-not-found';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { executionUtils } from '@/features/executions';
import {
  IssueReplayDialog,
  IssueSeverityBadge,
  IssueStatusBadge,
  issueMembersHooks,
  issuesHooks,
  issueUiUtils,
} from '@/features/issues';
import { ReconciliationDifferences } from '@/features/reconciliation/reconciliation';
import { runLogUiUtils } from '@/features/run-logs/utils/run-log-ui-utils';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { notFoundError } from '@/lib/not-found-error';
import { cn } from '@/lib/utils';

function IssueDetailPage() {
  const { issueId } = useParams<{ issueId: string }>();
  const { data: issue, isLoading, error } = issuesHooks.useIssue(issueId!);
  if (notFoundError.isNotFound(error)) {
    return <ResourceNotFound kind="issue" />;
  }
  if (isLoading || !issue) {
    return (
      <div className="w-full px-6 py-5">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  return <IssueDetail key={issue.id} issue={issue} />;
}

function IssueDetail({ issue }: { issue: IssueWithSeverity }) {
  const { checkAccess } = useAuthorization();
  const canWrite = checkAccess(Permission.WRITE_ISSUE);
  const canReplay = checkAccess(Permission.WRITE_RUN);
  const { assignable, nameOf } = issueMembersHooks.useIssueMembers();
  const { mutate: update } = issuesHooks.useUpdateIssue(issue.id);
  const workflowStopped = issuesHooks.useWorkflowStopped(issue.workflowId);
  const [replayStrategy, setReplayStrategy] =
    useState<WorkflowRetryStrategy | null>(null);
  const muted =
    !!issue.mutedUntil && new Date(issue.mutedUntil).getTime() > Date.now();

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-6 py-5">
      <Link
        to={authenticationSession.appendProjectRoutePrefix('/issues')}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
      >
        <ArrowLeft className="size-4" />
        {t('All issues')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2 min-w-0">
          <TextWithTooltip tooltipMessage={issueUiUtils.issueTitle(issue)}>
            <h1 className="text-xl font-semibold truncate">
              {issueUiUtils.issueTitle(issue)}
            </h1>
          </TextWithTooltip>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <IssueStatusBadge
              status={issue.status}
              reopened={issue.reopened}
              muted={muted}
            />
            <IssueSeverityBadge severity={issue.severity} />
            <Badge variant="outline">
              {issueUiUtils.kindLabel(issue.kind)}
            </Badge>
            {issue.errorCode && (
              <TextWithTooltip tooltipMessage={issue.errorCode}>
                <span>{runLogUiUtils.errorCodeLabel(issue.errorCode)}</span>
              </TextWithTooltip>
            )}
            <span>
              {t('First seen')}{' '}
              <FormattedDate date={new Date(issue.firstSeenAt)} />
            </span>
            <span>
              {t('Last seen')}{' '}
              <FormattedDate date={new Date(issue.lastSeenAt)} />
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!canWrite}>
                {issue.assigneeId ? nameOf(issue.assigneeId) : t('Assign')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {assignable.map((member) => (
                <DropdownMenuItem
                  key={member.id}
                  onSelect={() => update({ assigneeId: member.id })}
                >
                  {member.name}
                </DropdownMenuItem>
              ))}
              {assignable.length === 0 ? (
                <DropdownMenuItem disabled>
                  {t('No members to assign yet')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuItem
                disabled={!issue.assigneeId}
                onSelect={() => update({ assigneeId: null })}
              >
                {t('Remove assignee')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!canWrite}>
                <BellOff className="size-4 mr-1" />
                {muted ? t('Muted') : t('Mute')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{t('Mute alerts for')}</DropdownMenuLabel>
              {MUTE_HOURS.map((hours) => (
                <DropdownMenuItem
                  key={hours}
                  onSelect={() => update({ mutedForHours: hours })}
                >
                  {t('{hours} hours', { hours })}
                </DropdownMenuItem>
              ))}
              {muted && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => update({ mutedForHours: null })}
                  >
                    {t('Unmute')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!canWrite}>
                {issueUiUtils.statusLabel(issue.status)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {Object.values(IssueStatus).map((status) => (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => update({ status })}
                >
                  {issueUiUtils.statusLabel(status)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {issue.status !== IssueStatus.RESOLVED && (
            <Button
              size="sm"
              disabled={!canWrite}
              onClick={() => update({ status: IssueStatus.RESOLVED })}
            >
              <CheckCircle2 className="size-4 mr-1" />
              {t('Mark resolved')}
            </Button>
          )}
        </div>
      </div>

      <IssueBanners
        issue={issue}
        muted={muted}
        onUnignore={() => update({ status: IssueStatus.OPEN })}
        canWrite={canWrite}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 flex flex-col gap-4">
          <InsightCard
            issue={issue}
            canReplay={canReplay}
            workflowStopped={workflowStopped}
            canWrite={canWrite}
            onReplay={setReplayStrategy}
            onIgnore={() => update({ status: IssueStatus.IGNORED })}
          />
          {issue.kind === IssueKind.RECONCILIATION &&
            issue.message.startsWith('reconciliation:') && (
              <ReconciliationDifferences
                projectId={issue.projectId}
                ruleId={issue.message.slice('reconciliation:'.length)}
              />
            )}
          {issue.kind === IssueKind.TRIGGER && (
            <AffectedWorkflowsCard issueId={issue.id} />
          )}
          {issue.kind !== IssueKind.DRIFT &&
            issue.kind !== IssueKind.RECONCILIATION &&
            issue.kind !== IssueKind.TRIGGER && (
              <>
                <TrendCard issueId={issue.id} />
                <AffectedRunsCard
                  issueId={issue.id}
                  canReplay={canReplay}
                  workflowStopped={workflowStopped}
                  onReplay={setReplayStrategy}
                />
              </>
            )}
          <ActivityCard
            issueId={issue.id}
            canWrite={canWrite}
            nameOf={nameOf}
          />
        </div>
        <div className="flex flex-col gap-4">
          <OverviewCard issue={issue} nameOf={nameOf} />
          <AlertsCard
            issueId={issue.id}
            kind={issue.kind}
            affectedWorkflows={issue.affectedWorkflows}
          />
        </div>
      </div>

      {replayStrategy !== null && (
        <IssueReplayDialog
          workflowName={issue.workflowDisplayName ?? null}
          issueId={issue.id}
          open
          initialStrategy={replayStrategy}
          onOpenChange={(open) => !open && setReplayStrategy(null)}
        />
      )}
    </div>
  );
}

function IssueBanners({
  issue,
  muted,
  canWrite,
  onUnignore,
}: {
  issue: IssueWithSeverity;
  muted: boolean;
  canWrite: boolean;
  onUnignore: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {issue.reopened && issue.status === IssueStatus.OPEN && (
        <Alert
          variant="destructive"
          className="bg-destructive-100/10 border-destructive/50"
        >
          <RotateCcw className="size-4" />
          <AlertDescription>
            {t(
              'This issue was resolved and failed again, so it was reopened and alerted.',
            )}
          </AlertDescription>
        </Alert>
      )}
      {issue.status === IssueStatus.RESOLVED && (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            {t(
              'Resolved. If it fails again it will reopen automatically and alert.',
            )}
          </AlertDescription>
        </Alert>
      )}
      {issue.status === IssueStatus.IGNORED && (
        <Alert variant="warning" className="bg-warning-100/10">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>
              {t('Ignored. New failures keep counting but do not alert.')}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!canWrite}
              onClick={onUnignore}
            >
              {t('Stop ignoring')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {muted && issue.mutedUntil && (
        <Alert variant="warning" className="bg-warning-100/10">
          <BellOff className="size-4" />
          <AlertDescription>
            {t('Alerts are muted until')}{' '}
            <FormattedDate date={new Date(issue.mutedUntil)} />
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function InsightCard({
  issue,
  canReplay,
  workflowStopped,
  canWrite,
  onReplay,
  onIgnore,
}: {
  issue: IssueWithSeverity;
  canReplay: boolean;
  workflowStopped: boolean;
  canWrite: boolean;
  onReplay: (strategy: WorkflowRetryStrategy) => void;
  onIgnore: () => void;
}) {
  const navigate = useNavigate();
  const { data: insight, isLoading } = issuesHooks.useInsight(issue.id);
  const openWorkflow = () => {
    if (issue.workflowId) {
      navigate(
        authenticationSession.appendProjectRoutePrefix(
          `/workflows/${issue.workflowId}`,
        ),
      );
    }
  };
  const handlers: Record<IssueFixKind, { run: () => void; allowed: boolean }> =
    {
      [IssueFixKind.REAUTHORIZE_CONNECTION]: {
        run: () =>
          navigate(
            authenticationSession.appendProjectRoutePrefix('/connections'),
          ),
        allowed: true,
      },
      [IssueFixKind.OPEN_STEP_INPUT]: {
        run: openWorkflow,
        allowed: !!issue.workflowId,
      },
      [IssueFixKind.OPEN_STEP_ERROR_HANDLING]: {
        run: openWorkflow,
        allowed: !!issue.workflowId,
      },
      [IssueFixKind.REPLAY_FROM_FAILED_STEP]: {
        run: () => onReplay(WorkflowRetryStrategy.FROM_FAILED_STEP),
        allowed: canReplay && !workflowStopped,
      },
      [IssueFixKind.REPLAY_FULL]: {
        run: () => onReplay(WorkflowRetryStrategy.ON_LATEST_VERSION),
        allowed: canReplay && !workflowStopped,
      },
      [IssueFixKind.OPEN_RUN]: {
        run: () =>
          navigate(
            authenticationSession.appendProjectRoutePrefix(
              `/runs?workflowId=${issue.workflowId ?? ''}&time=7d`,
            ),
          ),
        allowed: !!issue.workflowId,
      },
      [IssueFixKind.OPEN_MAPPING_TABLES]: {
        run: () =>
          navigate(
            authenticationSession.appendProjectRoutePrefix('/mapping-tables'),
          ),
        allowed: true,
      },
      [IssueFixKind.IGNORE]: { run: onIgnore, allowed: canWrite },
    };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          {t('Root cause analysis')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading || !insight ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <p className="text-sm">{issueUiUtils.causeText(insight)}</p>
            <p className="text-sm" data-testid="issue-fix-owner">
              <span className="text-muted-foreground">
                {t('Who can fix it')}
              </span>{' '}
              <span className="font-medium">
                {issueUiUtils.ownerLabel(insight.owner)}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {issue.kind === IssueKind.TRIGGER
                ? t(
                    '{count, plural, =1 {The trigger of 1 workflow cannot check for new events, so none are picked up until it recovers.} other {The triggers of # workflows cannot check for new events, so none are picked up until it recovers.}}',
                    { count: issue.affectedWorkflows },
                  )
                : t('Affects {runs} runs across {workflows} workflows.', {
                    runs: issue.occurrences,
                    workflows: issue.affectedWorkflows,
                  })}
            </p>
            <div className="rounded-md bg-muted/50 p-3 text-sm break-words">
              <ExplainedErrorMessage
                message={issueUiUtils.messageText(issue.message)}
                messageClassName="font-mono text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {insight.fixes.map((fix) => (
                <DisabledReasonTooltip
                  key={fix.kind}
                  reason={
                    fix.disabledReason
                      ? issueUiUtils.replayReasonLabel(
                          fix.disabledReason,
                          insight.blockedUntil,
                        )
                      : workflowStopped && REPLAY_FIXES.includes(fix.kind)
                      ? t('The workflow is stopped. Start it before rerunning')
                      : null
                  }
                >
                  <Button
                    size="sm"
                    variant={
                      fix.kind === insight.fixes[0].kind ? 'default' : 'outline'
                    }
                    disabled={
                      !!fix.disabledReason || !handlers[fix.kind].allowed
                    }
                    onClick={handlers[fix.kind].run}
                  >
                    {issueUiUtils.fixLabel(fix.kind)}
                  </Button>
                </DisabledReasonTooltip>
              ))}
            </div>
            {insight.fixes.some((fix) => fix.disabledReason) && (
              <p className="text-xs text-muted-foreground">
                {insight.cause === IssueInsightCause.BLOCKED_UNTIL
                  ? t(
                      'Replaying is blocked until the other system accepts calls again, otherwise the runs would fail again.',
                    )
                  : t(
                      'Replaying is blocked until the connection is fixed, otherwise the runs would fail again.',
                    )}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DisabledReasonTooltip({
  reason,
  children,
}: {
  reason: string | null;
  children: ReactNode;
}) {
  if (reason === null) {
    return children;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}

function AffectedWorkflowsCard({ issueId }: { issueId: string }) {
  const { data: workflows } = issuesHooks.useAffectedWorkflows(issueId);
  return (
    <Card data-testid="issue-affected-workflows">
      <CardHeader>
        <CardTitle>{t('Affected workflows')}</CardTitle>
        <CardDescription>
          {t(
            'One cause, one problem: every workflow whose trigger fails for this reason is listed here and was alerted once.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {(workflows ?? []).map((workflow) => (
            <li
              key={workflow.id}
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <Link
                className="min-w-0 truncate text-primary hover:underline"
                to={authenticationSession.appendProjectRoutePrefix(
                  `/workflows/${workflow.id}`,
                )}
              >
                {workflow.displayName}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('Last failed')}{' '}
                <FormattedDate date={new Date(workflow.lastSeenAt)} />
              </span>
            </li>
          ))}
          {(workflows ?? []).length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">
              {t('Every affected workflow has recovered.')}
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function TrendCard({ issueId }: { issueId: string }) {
  const [granularity, setGranularity] = useState<IssueTrendGranularity>(
    IssueTrendGranularity.DAY,
  );
  const { data: trend } = issuesHooks.useTrend({ id: issueId, granularity });
  const buckets = trend?.buckets ?? [];
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('Occurrences')}</CardTitle>
        <div className="flex gap-1">
          {[IssueTrendGranularity.HOUR, IssueTrendGranularity.DAY].map(
            (option) => (
              <Button
                key={option}
                size="sm"
                variant={granularity === option ? 'secondary' : 'ghost'}
                onClick={() => setGranularity(option)}
              >
                {option === IssueTrendGranularity.HOUR
                  ? t('Last 24 hours')
                  : t('Last 30 days')}
              </Button>
            ),
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="flex h-28 items-stretch gap-0.5"
          role="img"
          aria-label={t('Occurrences')}
        >
          {buckets.map((bucket) => (
            <div
              key={bucket.start}
              className="flex flex-1 flex-col justify-end bg-muted/40 rounded-sm"
              title={`${new Date(bucket.start).toLocaleString()} · ${
                bucket.count
              }`}
            >
              <div
                className={cn(
                  'rounded-sm',
                  bucket.count > 0 ? 'bg-destructive/70' : 'bg-transparent',
                )}
                style={{ height: `${(bucket.count / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AffectedRunsCard({
  issueId,
  canReplay,
  workflowStopped,
  onReplay,
}: {
  issueId: string;
  canReplay: boolean;
  workflowStopped: boolean;
  onReplay: (strategy: WorkflowRetryStrategy) => void;
}) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data: page } = issuesHooks.useExecutions({
    id: issueId,
    cursor,
    limit: RUNS_PAGE_SIZE,
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('Affected runs')}</CardTitle>
        <DisabledReasonTooltip
          reason={
            workflowStopped
              ? t('The workflow is stopped. Start it before rerunning')
              : null
          }
        >
          <Button
            size="sm"
            variant="outline"
            disabled={!canReplay || workflowStopped}
            onClick={() => onReplay(WorkflowRetryStrategy.FROM_FAILED_STEP)}
          >
            <RotateCcw className="size-4 mr-1" />
            {t('Rerun from the failed step')}
          </Button>
        </DisabledReasonTooltip>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="flex flex-col divide-y">
          {(page?.data ?? []).map((execution) => {
            const { variant } = executionUtils.getStatusIcon(execution.status);
            return (
              <li
                key={execution.id}
                className="flex items-center justify-between py-2 text-sm gap-2"
              >
                <Link
                  className="flex min-w-0 items-center gap-2 text-primary hover:underline"
                  title={execution.id}
                  to={authenticationSession.appendProjectRoutePrefix(
                    `/runs/${execution.id}`,
                  )}
                >
                  <span className="truncate">
                    <FormattedDate
                      date={new Date(execution.created)}
                      includeTime
                    />
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {execution.id.slice(0, RUN_SHORT_ID_LENGTH)}
                  </span>
                </Link>
                <Badge
                  variant={
                    variant === 'error'
                      ? 'destructive'
                      : variant === 'success'
                      ? 'success'
                      : 'outline'
                  }
                >
                  {executionUtils.getStatusLabel(execution.status)}
                </Badge>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!page?.previous}
            onClick={() => setCursor(page?.previous ?? undefined)}
          >
            {t('Previous page')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!page?.next}
            onClick={() => setCursor(page?.next ?? undefined)}
          >
            {t('Next page')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityCard({
  issueId,
  canWrite,
  nameOf,
}: {
  issueId: string;
  canWrite: boolean;
  nameOf: (userId: string | null) => string;
}) {
  const [note, setNote] = useState('');
  const { data: activities } = issuesHooks.useActivities(issueId);
  const { mutate: addNote, isPending } = issuesHooks.useAddNote(issueId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Notes and activity')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Textarea
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            disabled={!canWrite}
            placeholder={t('Leave a note for whoever handles this next')}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button
            size="sm"
            className="self-start"
            disabled={!canWrite || note.trim().length === 0 || isPending}
            onClick={() =>
              addNote(note.trim(), { onSuccess: () => setNote('') })
            }
          >
            {t('Add remark')}
          </Button>
        </div>
        <ol className="flex flex-col gap-3">
          {(activities ?? []).map((activity) => (
            <li key={activity.id} className="flex flex-col gap-0.5 text-sm">
              <span className="text-xs text-muted-foreground">
                <FormattedDate date={new Date(activity.created)} />
                {activity.actorId && issueUiUtils.showsActorInHeader(activity)
                  ? ` · ${nameOf(activity.actorId)}`
                  : ''}
              </span>
              <span className="whitespace-pre-line break-words">
                {issueUiUtils.activityText({ activity, nameOf })}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function OverviewCard({
  issue,
  nameOf,
}: {
  issue: IssueWithSeverity;
  nameOf: (userId: string | null) => string;
}) {
  const rows: [string, string][] = [
    ...(issue.kind === IssueKind.TRIGGER
      ? []
      : [
          [
            issue.kind === IssueKind.DRIFT
              ? t('Records affected')
              : t('Failures'),
            String(issue.occurrences),
          ] satisfies [string, string],
        ]),
    [t('Affected workflows'), String(issue.affectedWorkflows)],
    ...(issue.kind === IssueKind.TRIGGER
      ? [
          [t('Connection'), issue.connectionExternalId ?? '—'] satisfies [
            string,
            string,
          ],
        ]
      : []),
    [t('Workflow'), issue.workflowDisplayName ?? '—'],
    [t('Step'), issue.stepDisplayName ?? '—'],
    [
      t('Assignee'),
      issue.assigneeId ? nameOf(issue.assigneeId) : t('Unassigned'),
    ],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Overview')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function AlertsCard({
  issueId,
  kind,
  affectedWorkflows,
}: {
  issueId: string;
  kind: IssueKind;
  affectedWorkflows: number;
}) {
  const { data: alerts } = issuesHooks.useAlerts(issueId);
  const alertList = alerts ?? [];
  const merged = alertList
    .filter((alert) => FAILURE_ALERT_KINDS.includes(alert.kind))
    .reduce((sum, alert) => sum + alert.mergedCount, 0);
  const description =
    alertList.length === 0
      ? t('No alert has been triggered yet')
      : kind === IssueKind.TRIGGER
      ? t('{workflows} workflows → {alerts} alerts', {
          workflows: affectedWorkflows,
          alerts: alertList.length,
        })
      : t('{failures} failures → {alerts} alerts', {
          failures: merged,
          alerts: alertList.length,
        });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Alerts')}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {alertList.length > 0 && (
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {alertList.map((alert) => (
              <li key={alert.id} className="flex flex-col">
                <span>
                  {issueUiUtils.alertKindLabel(alert.kind)}
                  {alert.mergedCount > 1
                    ? ` · ${t('merged {count}', { count: alert.mergedCount })}`
                    : ''}
                </span>
                <span className="text-xs text-muted-foreground">
                  <FormattedDate
                    date={new Date(alert.sentAt ?? alert.scheduledAt)}
                  />
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

const MUTE_HOURS = [1, 4, 24] as const;
const FAILURE_ALERT_KINDS: AlertRecordKind[] = [
  AlertRecordKind.NEW,
  AlertRecordKind.REOPENED,
  AlertRecordKind.STILL_FAILING,
];
const REPLAY_FIXES: IssueFixKind[] = [
  IssueFixKind.REPLAY_FROM_FAILED_STEP,
  IssueFixKind.REPLAY_FULL,
];
const RUNS_PAGE_SIZE = 8;
const RUN_SHORT_ID_LENGTH = 6;
const NOTE_MAX_LENGTH = 500;

export { IssueDetailPage };
