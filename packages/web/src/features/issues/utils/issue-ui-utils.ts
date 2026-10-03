import {
  AlertRecordKind,
  IssueActivity,
  IssueActivityType,
  IssueFixKind,
  IssueInsightCause,
  IssueKind,
  IssueSeverity,
  IssueStatus,
  IssueWithSeverity,
  ReplayCategory,
  ReplayReason,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

function statusLabel(status: IssueStatus): string {
  switch (status) {
    case IssueStatus.OPEN:
      return t('Open');
    case IssueStatus.INVESTIGATING:
      return t('Investigating');
    case IssueStatus.RESOLVED:
      return t('Resolved');
    case IssueStatus.IGNORED:
      return t('Ignored');
  }
}

function severityLabel(severity: IssueSeverity): string {
  switch (severity) {
    case IssueSeverity.HIGH:
      return t('High');
    case IssueSeverity.MEDIUM:
      return t('Medium');
    case IssueSeverity.LOW:
      return t('Low');
  }
}

function issueTitle(
  issue: Pick<IssueWithSeverity, 'kind' | 'title' | 'connectionExternalId'>,
): string {
  if (issue.kind === IssueKind.CONNECTION) {
    return t('Connection {name} failed to authenticate', {
      name: issue.connectionExternalId ?? issue.title,
    });
  }
  if (issue.kind === IssueKind.DRIFT) {
    return t('The connected system does not match what the run did');
  }
  return issue.title;
}

function causeText({
  cause,
  httpStatus,
}: {
  cause: IssueInsightCause;
  httpStatus: number | null;
}): string {
  switch (cause) {
    case IssueInsightCause.CONNECTION_AUTH:
      return t(
        'The connection failed to authenticate. Every step that uses it fails at the authentication stage, regardless of the workflow configuration.',
      );
    case IssueInsightCause.STEP_TIMEOUT:
      return t(
        'The step ran longer than its time limit. The most common cause is querying or processing too much data at once, followed by a slow downstream system.',
      );
    case IssueInsightCause.RATE_LIMITED:
      return t(
        'The downstream service is rate limiting. Replaying right away usually fails again: wait until its limit window passes (some services, such as Beisen, refuse calls until the next day) and lower how often or how much the workflow calls it.',
      );
    case IssueInsightCause.NOT_FOUND:
      return t(
        'The record the step operates on no longer exists in the downstream system. Replaying will not succeed.',
      );
    case IssueInsightCause.UPSTREAM_TIMEOUT:
      return t(
        'The downstream system did not respond in time, usually because it is under load or the network is unstable.',
      );
    case IssueInsightCause.REJECTED_INPUT:
      return t(
        'The downstream API rejected the request (HTTP {status}). This is a data or configuration problem; fix it before replaying or the runs will fail again.',
        { status: httpStatus ?? '' },
      );
    case IssueInsightCause.ACCESS_DENIED:
      return t(
        'The other system refused access (HTTP {status}). Fix the permission or credential there, then replay.',
        { status: httpStatus ?? '' },
      );
    case IssueInsightCause.UPSTREAM_ERROR:
      return t(
        'The downstream system returned a server error (HTTP {status}). It is usually temporary; replay once it recovers.',
        { status: httpStatus ?? '' },
      );
    case IssueInsightCause.RESULT_MISMATCH:
      return t(
        'The run reported success, but reading the result back from the connected system shows something different. Someone may have changed it by hand, or a later change overwrote it. The activity list names who is affected; open the run and rerun it if the data is still right.',
      );
    case IssueInsightCause.STEP_ERROR:
      return t(
        'The step failed without an HTTP status, for example a network or script error. Check the error below and the step inputs before replaying.',
      );
  }
}

function fixLabel(kind: IssueFixKind): string {
  switch (kind) {
    case IssueFixKind.REAUTHORIZE_CONNECTION:
      return t('Reconnect the connection');
    case IssueFixKind.OPEN_STEP_INPUT:
      return t('Open the step and check its inputs');
    case IssueFixKind.OPEN_STEP_ERROR_HANDLING:
      return t('Open the step and configure retries');
    case IssueFixKind.REPLAY_FROM_FAILED_STEP:
      return t('Replay from the failed step');
    case IssueFixKind.REPLAY_FULL:
      return t('Replay the whole run');
    case IssueFixKind.OPEN_RUN:
      return t('Open the runs of this workflow');
    case IssueFixKind.IGNORE:
      return t('Confirm it is transient and ignore');
  }
}

function replayReasonLabel(reason: ReplayReason): string {
  switch (reason) {
    case ReplayReason.CONNECTION_RECOVERED:
      return t('The connection has recovered');
    case ReplayReason.TRANSIENT_ERROR:
      return t('Transient error (rate limit or timeout)');
    case ReplayReason.AUTHORIZATION_ERROR:
      return t(
        'The other system refused access; replay once permissions are fixed there',
      );
    case ReplayReason.WORKFLOW_CHANGED:
      return t('The workflow changed after the failure');
    case ReplayReason.MAPPING_TABLE_CHANGED:
      return t('A mapping table the workflow uses changed after the failure');
    case ReplayReason.UNCHANGED_SINCE_FAILURE:
      return t(
        'Nothing changed since the failure; it will most likely fail again',
      );
    case ReplayReason.REJECTED_BY_TARGET:
      return t(
        'The other system rejected the data; fix it there first, editing the workflow will not change the result',
      );
    case ReplayReason.CONNECTION_STILL_BROKEN:
      return t('The connection is still broken');
    case ReplayReason.CONNECTION_DELETED:
      return t('The connection was deleted');
    case ReplayReason.DUPLICATE_ATTEMPT:
      return t('Another attempt of the same trigger');
    case ReplayReason.ALREADY_RETRIED:
      return t('Already replayed or in progress');
    case ReplayReason.WORKFLOW_DELETED:
      return t('The workflow was deleted');
    case ReplayReason.FAILED_STEP_MISSING:
      return t('The failed step no longer exists in the new version');
  }
}

function replayCategoryLabel(category: ReplayCategory): string {
  switch (category) {
    case ReplayCategory.REPLAYABLE:
      return t('Can be replayed');
    case ReplayCategory.DATA_PROBLEM:
      return t('Data or configuration problem');
    case ReplayCategory.BLOCKED:
      return t('Blocked');
    case ReplayCategory.NOT_NEEDED:
      return t('No replay needed');
  }
}

function alertKindLabel(kind: AlertRecordKind): string {
  switch (kind) {
    case AlertRecordKind.NEW:
      return t('New issue');
    case AlertRecordKind.REOPENED:
      return t('Reopened');
    case AlertRecordKind.THRESHOLD:
      return t('Threshold exceeded');
    case AlertRecordKind.ESCALATED:
      return t('Escalated');
    case AlertRecordKind.STILL_FAILING:
      return t('Still failing');
    case AlertRecordKind.CAPACITY:
      return t('Capacity');
  }
}

function activityText({
  activity,
  nameOf,
}: {
  activity: IssueActivity;
  nameOf: (userId: string | null) => string;
}): string {
  const actor = nameOf(activity.actorId ?? null);
  const data = activity.data;
  switch (activity.type) {
    case IssueActivityType.FIRST_SEEN:
      return t('First failure recorded');
    case IssueActivityType.REOPENED:
      return t('Failed again after being resolved; reopened');
    case IssueActivityType.STATUS_CHANGED:
      return t('{actor} changed the status to {status}', {
        actor,
        status: isIssueStatus(data.to) ? statusLabel(data.to) : String(data.to),
      });
    case IssueActivityType.ASSIGNED:
      return typeof data.assigneeId === 'string'
        ? t('{actor} assigned it to {assignee}', {
            actor,
            assignee: nameOf(data.assigneeId),
          })
        : t('{actor} removed the assignee', { actor });
    case IssueActivityType.MUTED:
      return typeof data.hours === 'number'
        ? t('{actor} muted alerts for {hours} hours', {
            actor,
            hours: data.hours,
          })
        : t('{actor} unmuted alerts', { actor });
    case IssueActivityType.NOTE:
      return typeof data.text === 'string' ? data.text : '';
    case IssueActivityType.ALERT_SENT:
      return data.success === true
        ? t('Alert sent')
        : t('Alert delivery failed');
    case IssueActivityType.REPLAYED:
      return t('{actor} replayed {count} runs', {
        actor,
        count: typeof data.queued === 'number' ? data.queued : 0,
      });
  }
}

function isIssueStatus(value: unknown): value is IssueStatus {
  return (
    typeof value === 'string' &&
    Object.values<string>(IssueStatus).includes(value)
  );
}

export const issueUiUtils = {
  statusLabel,
  severityLabel,
  issueTitle,
  causeText,
  fixLabel,
  replayReasonLabel,
  replayCategoryLabel,
  alertKindLabel,
  activityText,
};
