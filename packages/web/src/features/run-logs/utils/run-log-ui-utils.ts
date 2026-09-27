import { isNil } from '@fema-ipaas/core-utils';
import {
  ConnectionStatus,
  RunLogCondition,
  RunLogConditionField,
  RunLogDurationOperator,
  RunLogScope,
  RunLogTimeRange,
  RunLogType,
  RunRerunBlockReason,
  StepOutput,
  StepOutputStatus,
  workflowStructureUtil,
  WorkflowTrigger,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { executionUtils } from '@/features/executions/utils/execution-utils';

function timeRangeLabel(time: RunLogTimeRange): string {
  switch (time) {
    case RunLogTimeRange.MINUTES_15:
      return t('Last 15 minutes');
    case RunLogTimeRange.MINUTES_30:
      return t('Last 30 minutes');
    case RunLogTimeRange.HOURS_1:
      return t('Last 1 hour');
    case RunLogTimeRange.HOURS_24:
      return t('Last 24 hours');
    case RunLogTimeRange.DAYS_3:
      return t('Last 3 days');
    case RunLogTimeRange.DAYS_7:
      return t('Last 7 days');
    case RunLogTimeRange.DAYS_15:
      return t('Last 15 days');
    case RunLogTimeRange.DAYS_30:
      return t('Last 30 days');
  }
}

function typeLabel(type: RunLogType): string {
  switch (type) {
    case RunLogType.RUN:
      return t('Run logs');
    case RunLogType.DEBUG:
      return t('Debug logs');
    case RunLogType.ALL:
      return t('All');
  }
}

function fieldLabel(field: RunLogConditionField): string {
  switch (field) {
    case RunLogConditionField.PROJECT:
      return t('Project');
    case RunLogConditionField.WORKFLOW:
      return t('Workflow');
    case RunLogConditionField.STATUS:
      return t('Run status');
    case RunLogConditionField.CONNECTOR:
      return t('Connector');
    case RunLogConditionField.CONTENT:
      return t('Log content');
    case RunLogConditionField.DURATION:
      return t('Run duration');
  }
}

function durationOperatorLabel(operator: RunLogDurationOperator): string {
  return operator === RunLogDurationOperator.GTE ? t('At least') : t('At most');
}

function blockReasonLabel(reason: RunRerunBlockReason): string {
  switch (reason) {
    case RunRerunBlockReason.DEBUG_RUN:
      return t('Debug logs cannot be rerun');
    case RunRerunBlockReason.DEDUPED:
      return t('Deduplicated triggers never ran, so there is nothing to rerun');
    case RunRerunBlockReason.WORKFLOW_DELETED:
      return t('The workflow has been deleted');
    case RunRerunBlockReason.SUBFLOW_RUN:
      return t('Subflow runs are rerun together with their parent run');
    case RunRerunBlockReason.RERUN_SUCCEEDED:
      return t('This trigger has already been rerun successfully');
    case RunRerunBlockReason.RERUN_IN_PROGRESS:
      return t('This trigger is being rerun');
    case RunRerunBlockReason.NOT_FAILED:
      return t('Only failed or timed out runs can be rerun');
    case RunRerunBlockReason.VIEW_ONLY:
      return t('You only have view access to this project');
    case RunRerunBlockReason.NO_PUBLISHED_VERSION:
      return t('The workflow has no published version in this environment');
    case RunRerunBlockReason.WORKFLOW_STOPPED:
      return t('The workflow is stopped. Start it before rerunning');
    case RunRerunBlockReason.NO_FAILED_STEP:
      return t(
        'This log did not record a failed step. Rerun the whole run instead',
      );
    case RunRerunBlockReason.RAW_DATA_EXPIRED:
      return t(
        'The original run data has expired. Rerun the whole run instead',
      );
  }
}

function retentionText(scope: RunLogScope): string {
  const exceptions = scope.projects.filter(
    (project) => project.retentionDays !== scope.tenantRetentionDays,
  );
  const base = t('Logs are kept for {days} days', {
    days: scope.tenantRetentionDays,
  });
  if (exceptions.length === 0) {
    return base;
  }
  const detail = exceptions
    .map((project) =>
      t('{project} {days} days', {
        project: project.displayName,
        days: project.retentionDays,
      }),
    )
    .join(t('listSeparator'));
  return t('{base} ({detail})', { base, detail });
}

function maxRetentionDays(scope: RunLogScope): number {
  return scope.projects.reduce(
    (max, project) => Math.max(max, project.retentionDays),
    0,
  );
}

function errorHint(errorCode: string): string {
  if (
    errorCode === 'CONNECTION_EXPIRED' ||
    errorCode === 'CONNECTION_LOADING_FAILED'
  ) {
    return t(
      'The connection used by this step is no longer authorized. Reconnect it on the Connections page, then rerun from the failed step.',
    );
  }
  if (errorCode === 'CONNECTION_NOT_FOUND') {
    return t(
      'The connection used by this step was deleted. Pick another connection in the workflow, publish, then rerun.',
    );
  }
  if (errorCode === 'STEP_TIMEOUT') {
    return t(
      'The step ran longer than allowed. Narrow the query or split the work into batches, publish, then rerun.',
    );
  }
  return t(
    'Check that the step input matches what the API expects, publish the fix, then rerun. For occasional errors, add a retry for this error code in the step error handling.',
  );
}

function connectionStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case ConnectionStatus.ACTIVE:
      return t('Connected');
    case ConnectionStatus.ERROR:
      return t('Connection error');
    case ConnectionStatus.MISSING:
      return t('Not connected');
    default:
      return t('Deleted');
  }
}

function conditionLabel({
  condition,
  scope,
  connectorName,
}: {
  condition: RunLogCondition;
  scope: RunLogScope | undefined;
  connectorName: (name: string) => string;
}): string {
  const label = fieldLabel(condition.field);
  switch (condition.field) {
    case RunLogConditionField.PROJECT:
      return `${label}: ${condition.values
        .map(
          (id) =>
            scope?.projects.find((project) => project.id === id)?.displayName ??
            t('Project unavailable'),
        )
        .join(t('listSeparator'))}`;
    case RunLogConditionField.WORKFLOW:
      return `${label}: ${condition.values
        .map(
          (id) =>
            scope?.workflows.find((workflow) => workflow.id === id)
              ?.displayName ?? id,
        )
        .join(t('listSeparator'))}`;
    case RunLogConditionField.STATUS:
      return `${label}: ${condition.values
        .map((status) => executionUtils.getStatusLabel(status))
        .join(t('listSeparator'))}`;
    case RunLogConditionField.CONNECTOR:
      return `${label}: ${condition.values
        .map((name) => connectorName(name))
        .join(t('listSeparator'))}`;
    case RunLogConditionField.CONTENT:
      return t('Log content contains: {text}', { text: condition.text.trim() });
    case RunLogConditionField.DURATION:
      return t('Run duration {operator} {seconds} seconds', {
        operator: durationOperatorLabel(condition.operator),
        seconds: condition.seconds.trim(),
      });
  }
}

function stepNodes({
  trigger,
  steps,
  loopIndexes,
}: {
  trigger: WorkflowTrigger | undefined;
  steps: Record<string, StepOutput>;
  loopIndexes: Record<string, number>;
}): RunLogStepNode[] {
  const ordered = isNil(trigger)
    ? Object.keys(steps).map((name) => ({ name, displayName: name }))
    : workflowStructureUtil.getAllSteps(trigger).map((step) => ({
        name: step.name,
        displayName: step.displayName,
      }));
  return ordered.map(({ name, displayName }) => {
    const output = executionUtils.extractStepOutput(name, loopIndexes, steps);
    return {
      name,
      displayName,
      status: output?.status ?? null,
      durationMs: output?.duration ?? null,
      errorMessage: output?.errorMessage ?? null,
      input: output?.input,
      output: output?.output,
    };
  });
}

export const runLogUiUtils = {
  timeRangeLabel,
  typeLabel,
  fieldLabel,
  durationOperatorLabel,
  blockReasonLabel,
  retentionText,
  maxRetentionDays,
  errorHint,
  connectionStatusLabel,
  conditionLabel,
  stepNodes,
};

export type RunLogStepNode = {
  name: string;
  displayName: string;
  status: StepOutputStatus | null;
  durationMs: number | null;
  errorMessage: string | null;
  input: unknown;
  output: unknown;
};
