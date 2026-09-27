import { isNil } from '@fema-ipaas/core-utils';
import {
  errorHandlingUtils,
  Execution,
  ExecutionStatus,
  RunLogDetail,
  StepOutputStatus,
  WorkflowTrigger,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ChevronDown,
  ChevronUp,
  CircleDashed,
  ExternalLink,
  Siren,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { JsonViewer } from '@/components/custom/json-viewer';
import { Button } from '@/components/ui/button';
import { StepStatusIcon } from '@/features/executions/components/step-status-icon';
import { executionUtils } from '@/features/executions/utils/execution-utils';
import { MaskedPayloadNotice } from '@/features/privacy';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { RunLogStepNode, runLogUiUtils } from '../utils/run-log-ui-utils';

export function RunLogNodeTrail({
  run,
  detail,
  trigger,
}: {
  run: Execution;
  detail: RunLogDetail;
  trigger: WorkflowTrigger | undefined;
}) {
  const loopIndexes = executionUtils.pinLoopsToIterationsWithFailedStep(
    run,
    {},
  );
  const nodes = runLogUiUtils.stepNodes({
    trigger,
    steps: run.steps ?? {},
    loopIndexes,
  });
  const errorNodes = nodes.filter(
    (node) => node.status === StepOutputStatus.FAILED,
  );
  const defaultNode =
    errorNodes[0]?.name ??
    nodes.find((node) => node.status === StepOutputStatus.RUNNING)?.name ??
    nodes.find((node) => node.status === StepOutputStatus.PAUSED)?.name ??
    nodes[0]?.name ??
    null;
  const [selected, setSelected] = useState<string | null>(defaultNode);
  const current = nodes.find((node) => node.name === selected) ?? null;
  const errorIndex = errorNodes.findIndex((node) => node.name === selected);

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          'This log has no step data. The run may not have started yet, or its step data has passed the retention period.',
        )}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {errorNodes.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-destructive">
            {t('{count, plural, =1 {1 step failed} other {# steps failed}}', {
              count: errorNodes.length,
            })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={errorIndex <= 0}
            onClick={() =>
              setSelected(errorNodes[Math.max(0, errorIndex - 1)].name)
            }
          >
            <ChevronUp className="size-4" />
            {t('Previous error')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={errorIndex >= errorNodes.length - 1}
            onClick={() =>
              setSelected(
                errorNodes[Math.min(errorNodes.length - 1, errorIndex + 1)]
                  .name,
              )
            }
          >
            <ChevronDown className="size-4" />
            {t('Next error')}
          </Button>
        </div>
      )}
      <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-[240px_1fr]">
        <ul className="flex max-h-[520px] flex-col gap-1 overflow-y-auto rounded-md border p-1">
          {nodes.map((node) => (
            <li key={node.name}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                  node.name === selected && 'bg-accent',
                )}
                onClick={() => setSelected(node.name)}
              >
                <NodeStatusIcon node={node} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{node.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {node.name}
                    {isNil(node.durationMs)
                      ? ''
                      : ` · ${formatUtils.formatDuration(
                          node.durationMs,
                          true,
                        )}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {current && (
          <NodeDetail
            key={current.name}
            node={current}
            run={run}
            detail={detail}
          />
        )}
      </div>
    </div>
  );
}

function NodeStatusIcon({ node }: { node: RunLogStepNode }) {
  if (isNil(node.status)) {
    return (
      <CircleDashed
        className="size-4 shrink-0 text-muted-foreground"
        aria-label={t('Not executed')}
      />
    );
  }
  return (
    <span className="shrink-0">
      <StepStatusIcon status={node.status} size="4" />
    </span>
  );
}

function NodeDetail({
  node,
  run,
  detail,
}: {
  node: RunLogStepNode;
  run: Execution;
  detail: RunLogDetail;
}) {
  const failed = node.status === StepOutputStatus.FAILED;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{node.displayName}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {node.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {isNil(node.status)
            ? t('Not executed')
            : executionUtils.getStatusIconForStep(node.status).text}
          {isNil(node.durationMs)
            ? ''
            : ` · ${formatUtils.formatDuration(node.durationMs, true)}`}
        </span>
      </div>
      {failed && <ErrorCard node={node} run={run} detail={detail} />}
      {isNil(node.status) ? (
        <p className="text-sm text-muted-foreground">
          {t('This step did not run.')}
        </p>
      ) : (
        <>
          <MaskedPayloadNotice
            executionId={run.id}
            stepName={node.name}
            maskedFields={run.privacyMaskedFields ?? 0}
            redacted={run.payloadRedacted ?? false}
          />
          <JsonViewer json={node.input ?? {}} title={t('Input')} />
          <JsonViewer json={node.output ?? null} title={t('Output')} />
        </>
      )}
    </div>
  );
}

function ErrorCard({
  node,
  run,
  detail,
}: {
  node: RunLogStepNode;
  run: Execution;
  detail: RunLogDetail;
}) {
  const classified = errorHandlingUtils.classifyErrorMessage({
    message: node.errorMessage ?? undefined,
    timedOut: run.status === ExecutionStatus.TIMEOUT,
  });
  const isRunFailedStep = run.failedStep?.name === node.name;
  const issue = isRunFailedStep ? detail.issue : null;
  const connection =
    isRunFailedStep && !isNil(classified.connectionExternalId)
      ? detail.connection
      : null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive-200 bg-destructive-50 p-3 text-sm dark:border-destructive-800 dark:bg-destructive-950">
      <div className="font-medium text-destructive-700 dark:text-destructive-200">
        {t('Error · {code}', { code: classified.errorCode })}
      </div>
      <p className="whitespace-pre-wrap break-words">
        {classified.message.length > 0
          ? classified.message
          : t('The step failed without an error message.')}
      </p>
      {!isNil(classified.httpStatus) && (
        <span className="text-xs text-muted-foreground">
          {t('HTTP status {status}', { status: classified.httpStatus })}
        </span>
      )}
      <p className="text-xs">
        <span className="font-medium">{t('Suggestion:')}</span>{' '}
        {runLogUiUtils.errorHint(classified.errorCode)}
      </p>
      {issue && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Siren className="size-3.5" />
          <span>
            {t(
              'The same cause has failed {count} times and was merged into one issue',
              { count: issue.occurrences },
            )}
          </span>
          <Link
            className="underline"
            to={`/projects/${run.projectId}/issues/${issue.id}`}
          >
            {t('View issue')}
          </Link>
        </div>
      )}
      {connection && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>
            {isNil(connection.displayName)
              ? t(
                  'The connection was deleted. Pick another connection in the workflow.',
                )
              : t('Connection {name} is currently: {status}', {
                  name: connection.displayName,
                  status: runLogUiUtils.connectionStatusLabel(
                    connection.status,
                  ),
                })}
          </span>
          {!isNil(connection.displayName) && (
            <Link
              className="inline-flex items-center gap-1 underline"
              to={`/projects/${run.projectId}/connections`}
            >
              {t('Go to connections')}
              <ExternalLink className="size-3" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
