import { ExecutionStatus } from '@fema-ipaas/shared';

function pickFailedRun<T extends { status: ExecutionStatus }>(
  executions: T[],
): T | null {
  return (
    executions.find((execution) =>
      FAILED_STATUSES.includes(execution.status),
    ) ??
    executions[0] ??
    null
  );
}

function runPath({
  runId,
  stepName,
  panel,
  issueId,
}: {
  runId: string;
  stepName: string | null;
  panel: RunFocusPanel | null;
  issueId: string | null;
}): string {
  const params = new URLSearchParams([
    ...(stepName ? [[PARAM.STEP, stepName]] : []),
    ...(panel ? [[PARAM.PANEL, panel]] : []),
    ...(issueId ? [[PARAM.ISSUE, issueId]] : []),
  ]);
  const query = params.toString();
  return query.length > 0 ? `/runs/${runId}?${query}` : `/runs/${runId}`;
}

function parse(params: URLSearchParams): RunFocus {
  const panel = params.get(PARAM.PANEL);
  return {
    stepName: params.get(PARAM.STEP),
    panel: panel === 'input' || panel === 'error' ? panel : null,
    issueId: params.get(PARAM.ISSUE),
  };
}

function stepPanelTab(panel: RunFocusPanel): string {
  return panel === 'error' ? 'error' : 'output';
}

const PARAM = {
  STEP: 'step',
  PANEL: 'panel',
  ISSUE: 'issueId',
};

const FAILED_STATUSES: ExecutionStatus[] = [
  ExecutionStatus.FAILED,
  ExecutionStatus.INTERNAL_ERROR,
  ExecutionStatus.TIMEOUT,
  ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
  ExecutionStatus.LOG_SIZE_EXCEEDED,
];

export const runFocusUtils = {
  pickFailedRun,
  runPath,
  parse,
  stepPanelTab,
};

export type RunFocusPanel = 'input' | 'error';

export type RunFocus = {
  stepName: string | null;
  panel: RunFocusPanel | null;
  issueId: string | null;
};
