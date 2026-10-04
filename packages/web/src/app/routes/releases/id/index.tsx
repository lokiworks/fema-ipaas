import {
  WorkflowReleaseDetail,
  WorkflowReleaseStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { FormattedDate } from '@/components/custom/formatted-date';
import { ResourceNotFound } from '@/components/custom/resource-not-found';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { executionUtils } from '@/features/executions';
import { issueMembersHooks } from '@/features/issues';
import {
  ReleaseChecks,
  releasesHooks,
  releaseUiUtils,
  StepDiff,
} from '@/features/releases';
import { authenticationSession } from '@/lib/authentication-session';
import { notFoundError } from '@/lib/not-found-error';

function ReleaseDetailPage() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const {
    data: release,
    isLoading,
    error,
  } = releasesHooks.useRelease(releaseId!);
  if (notFoundError.isNotFound(error)) {
    return <ResourceNotFound kind="release" />;
  }
  if (isLoading || !release) {
    return <Skeleton className="h-96 w-full" />;
  }
  return <ReleaseDetail key={release.id} release={release} />;
}

function ReleaseDetail({ release }: { release: WorkflowReleaseDetail }) {
  const { nameOf } = issueMembersHooks.useIssueMembers();
  const currentUserId = authenticationSession.getCurrentUserId();
  const [comment, setComment] = useState('');
  const { mutate: approve, isPending: approving } = releasesHooks.useApprove(
    release.id,
  );
  const { mutate: reject, isPending: rejecting } = releasesHooks.useReject(
    release.id,
  );
  const { mutate: withdraw, isPending: withdrawing } =
    releasesHooks.useWithdraw(release.id);
  const pending = release.status === WorkflowReleaseStatus.PENDING;
  const isRequester = release.requestedById === currentUserId;
  const isApprover =
    currentUserId !== null && release.approverIds.includes(currentUserId);

  return (
    <div className="flex flex-col gap-4 w-full">
      <Link
        to={authenticationSession.appendProjectRoutePrefix(
          '/releases?tab=requests',
        )}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
      >
        <ArrowLeft className="size-4" />
        {t('All release requests')}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{release.workflowDisplayName}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge
            variant={
              pending
                ? 'info'
                : release.status === WorkflowReleaseStatus.DEPLOYED
                ? 'success'
                : 'outline'
            }
          >
            {releaseUiUtils.statusLabel(release.status)}
          </Badge>
          <span>
            {t('Requested by {name}', { name: nameOf(release.requestedById) })}{' '}
            · <FormattedDate date={new Date(release.created)} />
          </span>
          {release.decidedById && release.decidedAt && (
            <span>
              · {t('Decided by {name}', { name: nameOf(release.decidedById) })}{' '}
              · <FormattedDate date={new Date(release.decidedAt)} />
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('What changed')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm whitespace-pre-line">{release.note}</p>
              <StepDiff
                workflowId={release.workflowId}
                versionId={release.workflowVersionId}
                previousVersionId={release.previousVersionId}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('Pre-release checks')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ReleaseChecks checks={release.checks} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('Test runs of this version')}</CardTitle>
              <CardDescription>
                {release.evidence.testRuns === 0
                  ? t(
                      'This version has not been run in the test environment yet.',
                    )
                  : t(
                      '{runs} test runs · {succeeded} succeeded · {failed} failed',
                      {
                        runs: release.evidence.testRuns,
                        succeeded: release.evidence.succeeded,
                        failed: release.evidence.failed,
                      },
                    )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {release.evidence.recent.map((run) => (
                  <li
                    key={run.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="font-mono text-xs">{run.id}</span>
                    <FormattedDate date={new Date(run.created)} />
                    <span>{executionUtils.getStatusLabel(run.status)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('Decision')}</CardTitle>
              <CardDescription>
                {t('Approvers: {names}', {
                  names: release.approverIds.map(nameOf).join('、'),
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {release.comment && (
                <p className="text-sm rounded-md bg-muted/50 p-3 whitespace-pre-line">
                  {releaseUiUtils.commentText(release.comment)}
                </p>
              )}
              {pending && isApprover && (
                <>
                  <Textarea
                    value={comment}
                    maxLength={200}
                    placeholder={t('Comment (required to reject)')}
                    onChange={(event) => setComment(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!release.canApprove || approving}
                      loading={approving}
                      title={
                        release.canApprove
                          ? undefined
                          : t('Fix the failing checks, or ask another approver')
                      }
                      onClick={() =>
                        approve({ comment: comment.trim() || undefined })
                      }
                    >
                      {t('Approve and publish')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={comment.trim().length === 0 || rejecting}
                      loading={rejecting}
                      onClick={() => reject({ comment: comment.trim() })}
                    >
                      {t('Reject')}
                    </Button>
                  </div>
                </>
              )}
              {pending && isRequester && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  loading={withdrawing}
                  onClick={() => withdraw()}
                >
                  {t('Withdraw request')}
                </Button>
              )}
              {!pending && !release.comment && (
                <p className="text-sm text-muted-foreground">
                  {t('No comment.')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export { ReleaseDetailPage };
