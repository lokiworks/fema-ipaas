import { ExecutionStatus, StepOutputStatus } from '@fema-ipaas/shared';

function failedStepName(row: {
  errorCount: number;
  failedStep?: { displayName: string } | null;
}): string | null {
  if (row.errorCount === 0) {
    return null;
  }
  return row.failedStep?.displayName ?? '';
}

function summarize({
  runStatus,
  failedStepName,
  nodes,
}: {
  runStatus: ExecutionStatus;
  failedStepName: string | null;
  nodes: {
    name: string;
    displayName: string;
    status: StepOutputStatus | null;
  }[];
}): NodeErrorSummary {
  const errorNodes = nodes.filter(
    (node) => node.status === StepOutputStatus.FAILED,
  );
  if (!RUN_FAILED_STATUSES.includes(runStatus)) {
    return errorNodes.length === 0
      ? { kind: 'NONE', failingNode: null, continuedCount: 0 }
      : {
          kind: 'CONTINUED_ONLY',
          failingNode: null,
          continuedCount: errorNodes.length,
        };
  }
  const failingNode =
    errorNodes.find((node) => node.name === failedStepName) ??
    errorNodes.at(-1) ??
    null;
  return {
    kind: 'FAILED_AT',
    failingNode: failingNode?.displayName ?? null,
    continuedCount: Math.max(0, errorNodes.length - 1),
  };
}

const RUN_FAILED_STATUSES: ExecutionStatus[] = [
  ExecutionStatus.FAILED,
  ExecutionStatus.INTERNAL_ERROR,
  ExecutionStatus.TIMEOUT,
  ExecutionStatus.MEMORY_LIMIT_EXCEEDED,
  ExecutionStatus.LOG_SIZE_EXCEEDED,
];

export const runLogErrorSummary = {
  failedStepName,
  summarize,
};

export type NodeErrorSummary = {
  kind: 'NONE' | 'FAILED_AT' | 'CONTINUED_ONLY';
  failingNode: string | null;
  continuedCount: number;
};
