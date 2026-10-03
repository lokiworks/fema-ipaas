import { Permission } from '@fema-ipaas/core-utils';
import {
  AlertRecordKind,
  IssueFixKind,
  IssueInsightCause,
  IssueKind,
  IssueStatus,
  IssueTrendGranularity,
  IssueWithSeverity,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ArrowLeft,
  BellOff,
  CheckCircle2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

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
import { executionUtils } from '@/features/executions';
import {
  IssueReplayDialog,
  IssueSeverityBadge,
  IssueStatusBadge,
  issueMembersHooks,
  issuesHooks,
  issueUiUtils,
} from '@/features/issues';
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
    return <Skeleton className="h-96 w-full" />;
  }
  return <IssueDetail key={issue.id} issue={issue} />;
}

function IssueDetail({ issue }: { issue: IssueWithSeverity }) {
  const { checkAccess } = useAuthorization();
  const canWrite = checkAccess(Permission.WRITE_ISSUE);
  const canReplay = checkAccess(Permission.WRITE_RUN);
  const { assignable, nameOf } = issueMembersHooks.useIssueMembers();
  const { mutate: update } = issuesHooks.useUpdateIssue(issue.id);
  const [replayOpen, setReplayOpen] = useState(false);
  const muted =
    !!issue.mutedUntil && new Date(issue.mutedUntil).getTime() > Date.now();

  return (
    <div className="flex flex-col gap-4 w-full">
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
              {issue.kind === IssueKind.CONNECTION
                ? t('Connection issue')
                : issue.kind === IssueKind.DRIFT
                ? t('Result mismatch')
                : t('Step issue')}
            </Badge>
            {issue.errorCode && (
              <span className="font-mono">{issue.errorCode}</span>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => update({ assigneeId: null })}>
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
            canWrite={canWrite}
            onReplay={() => setReplayOpen(true)}
            onIgnore={() => update({ status: IssueStatus.IGNORED })}
          />
          {issue.kind !== IssueKind.DRIFT && (
            <>
              <TrendCard issueId={issue.id} />
              <AffectedRunsCard
                issueId={issue.id}
                canReplay={canReplay}
                onReplay={() => setReplayOpen(true)}
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
          <AlertsCard issueId={issue.id} />
        </div>
      </div>

      <IssueReplayDialog
        issueId={issue.id}
        open={replayOpen}
        onOpenChange={setReplayOpen}
      />
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
  canWrite,
  onReplay,
  onIgnore,
}: {
  issue: IssueWithSeverity;
  canReplay: boolean;
  canWrite: boolean;
  onReplay: () => void;
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
        run: onReplay,
        allowed: canReplay,
      },
      [IssueFixKind.REPLAY_FULL]: { run: onReplay, allowed: canReplay },
      [IssueFixKind.OPEN_RUN]: {
        run: () =>
          navigate(
            authenticationSession.appendProjectRoutePrefix(
              `/runs?workflowId=${issue.workflowId ?? ''}&time=7d`,
            ),
          ),
        allowed: !!issue.workflowId,
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
        {insight && (
          <CardDescription>
            {t('Confidence {percent}%', {
              percent: Math.round(insight.confidence * 100),
            })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading || !insight ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <p className="text-sm">{issueUiUtils.causeText(insight)}</p>
            <p className="text-sm text-muted-foreground">
              {t('Affects {runs} runs across {workflows} workflows.', {
                runs: issue.occurrences,
                workflows: issue.affectedWorkflows,
              })}
            </p>
            <div className="rounded-md bg-muted/50 p-3 font-mono text-xs break-words">
              {issueUiUtils.messageText(issue.message)}
            </div>
            <div className="flex flex-wrap gap-2">
              {insight.fixes.map((fix) => (
                <Button
                  key={fix.kind}
                  size="sm"
                  variant={
                    fix.kind === insight.fixes[0].kind ? 'default' : 'outline'
                  }
                  disabled={!!fix.disabledReason || !handlers[fix.kind].allowed}
                  title={
                    fix.disabledReason
                      ? issueUiUtils.replayReasonLabel(
                          fix.disabledReason,
                          insight.blockedUntil,
                        )
                      : undefined
                  }
                  onClick={handlers[fix.kind].run}
                >
                  {issueUiUtils.fixLabel(fix.kind)}
                </Button>
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
  onReplay,
}: {
  issueId: string;
  canReplay: boolean;
  onReplay: () => void;
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
        <Button
          size="sm"
          variant="outline"
          disabled={!canReplay}
          onClick={onReplay}
        >
          <RotateCcw className="size-4 mr-1" />
          {t('Replay failed runs')}
        </Button>
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
                  className="font-mono text-xs text-primary hover:underline truncate"
                  to={authenticationSession.appendProjectRoutePrefix(
                    `/runs/${execution.id}`,
                  )}
                >
                  {execution.id}
                </Link>
                <span className="text-muted-foreground">
                  <FormattedDate date={new Date(execution.created)} />
                </span>
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
            {t('Previous')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!page?.next}
            onClick={() => setCursor(page?.next ?? undefined)}
          >
            {t('Next')}
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
            {t('Add note')}
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
    [
      issue.kind === IssueKind.DRIFT ? t('Records affected') : t('Failures'),
      String(issue.occurrences),
    ],
    [t('Affected workflows'), String(issue.affectedWorkflows)],
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

function AlertsCard({ issueId }: { issueId: string }) {
  const { data: alerts } = issuesHooks.useAlerts(issueId);
  const merged = (alerts ?? [])
    .filter((alert) => FAILURE_ALERT_KINDS.includes(alert.kind))
    .reduce((sum, alert) => sum + alert.mergedCount, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Alerts')}</CardTitle>
        <CardDescription>
          {t('{failures} failures → {alerts} alerts', {
            failures: merged,
            alerts: alerts?.length ?? 0,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {(alerts ?? []).map((alert) => (
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
          {(alerts ?? []).length === 0 && (
            <li className="text-muted-foreground">{t('No alerts sent yet')}</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

const MUTE_HOURS = [1, 4, 24] as const;
const FAILURE_ALERT_KINDS: AlertRecordKind[] = [
  AlertRecordKind.NEW,
  AlertRecordKind.REOPENED,
  AlertRecordKind.STILL_FAILING,
];
const RUNS_PAGE_SIZE = 8;
const NOTE_MAX_LENGTH = 500;

export { IssueDetailPage };
