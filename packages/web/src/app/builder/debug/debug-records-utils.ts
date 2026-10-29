import { isNil, tryParseFriendlyConnectorError } from '@fema-ipaas/core-utils';
import {
  StepOutput,
  StepOutputStatus,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

import { errorExplanation } from '@/lib/error-explanation';

function listNodes({
  trigger,
  outputs,
  displayNumbers,
}: {
  trigger: WorkflowTrigger;
  outputs: Record<string, StepOutput | undefined>;
  displayNumbers: Record<string, string>;
}): DebugNodeRow[] {
  return workflowStructureUtil.getAllSteps(trigger).map((step) => {
    const output = outputs[step.name];
    return {
      stepName: step.name,
      displayName: step.displayName,
      displayNumber: displayNumbers[step.name] ?? '',
      status: isNil(output) ? DebugNodeStatus.NOT_RUN : statusOf(output.status),
      durationMs: output?.duration ?? null,
    };
  });
}

function filterNodes({
  rows,
  status,
  query,
}: {
  rows: DebugNodeRow[];
  status: DebugNodeStatus | 'ALL';
  query: string;
}): DebugNodeRow[] {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((keyword) => keyword.length > 0);
  return rows.filter((row) => {
    if (status !== 'ALL' && row.status !== status) {
      return false;
    }
    const haystack =
      `${row.displayName} ${row.displayNumber} ${row.stepName}`.toLowerCase();
    return keywords.every((keyword) => haystack.includes(keyword));
  });
}

function selectedRowName({
  rows,
  selectedStep,
}: {
  rows: DebugNodeRow[];
  selectedStep: string | null;
}): string | null {
  const onCanvas = rows.find((row) => row.stepName === selectedStep);
  return (
    onCanvas?.stepName ??
    firstFailed(rows)?.stepName ??
    rows[0]?.stepName ??
    null
  );
}

function firstFailed(rows: DebugNodeRow[]): DebugNodeRow | null {
  return rows.find((row) => row.status === DebugNodeStatus.FAILED) ?? null;
}

function troubleshootingHints(errorText: string | null): DebugHint[] {
  if (isNil(errorText) || errorText.trim().length === 0) {
    return [];
  }
  const text = hintSubjectOf(errorText).toLowerCase();
  if (errorExplanation.isStepTimeout(text)) {
    return [DebugHint.STEP_TIMEOUT];
  }
  const rule = HINT_RULES.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(text)),
  );
  return isNil(rule) ? [] : [rule.hint];
}

function hintSubjectOf(errorText: string): string {
  const friendly = tryParseFriendlyConnectorError(errorText);
  if (isNil(friendly)) {
    return errorText;
  }
  const message = [friendly.apiMessage, friendly.message].find(
    (candidate) => typeof candidate === 'string' && candidate.trim().length > 0,
  );
  return [friendly.status, message, friendly.errorName]
    .filter((part) => !isNil(part))
    .join(' ');
}

function statusOf(status: StepOutputStatus): DebugNodeStatus {
  switch (status) {
    case StepOutputStatus.SUCCEEDED:
      return DebugNodeStatus.SUCCEEDED;
    case StepOutputStatus.FAILED:
      return DebugNodeStatus.FAILED;
    case StepOutputStatus.RUNNING:
    case StepOutputStatus.PAUSED:
      return DebugNodeStatus.RUNNING;
    default:
      return DebugNodeStatus.OTHER;
  }
}

export const debugRecordsUtils = {
  listNodes,
  filterNodes,
  firstFailed,
  selectedRowName,
  troubleshootingHints,
};

export enum DebugNodeStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  RUNNING = 'RUNNING',
  NOT_RUN = 'NOT_RUN',
  OTHER = 'OTHER',
}

export enum DebugHint {
  CHECK_CONNECTION = 'CHECK_CONNECTION',
  CHECK_PERMISSION = 'CHECK_PERMISSION',
  CHECK_RESOURCE = 'CHECK_RESOURCE',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  CHECK_NETWORK = 'CHECK_NETWORK',
  CHECK_INPUT = 'CHECK_INPUT',
  CHECK_REFERENCE = 'CHECK_REFERENCE',
  CHECK_CODE_NAME = 'CHECK_CODE_NAME',
  STEP_TIMEOUT = 'STEP_TIMEOUT',
}

const HINT_RULES: { hint: DebugHint; patterns: RegExp[] }[] = [
  {
    hint: DebugHint.CHECK_CODE_NAME,
    patterns: [/\bis not defined\b/, /\bis not a function\b/],
  },
  {
    hint: DebugHint.CHECK_REFERENCE,
    patterns: [/cannot read propert(?:y|ies) of (?:undefined|null)/],
  },
  {
    hint: DebugHint.CHECK_CONNECTION,
    patterns: [
      /\b401\b/,
      /unauthori[sz]ed/,
      /invalid[_ ]?token/,
      /token (?:has )?expired/,
    ],
  },
  {
    hint: DebugHint.CHECK_PERMISSION,
    patterns: [/\b403\b/, /forbidden/, /permission/, /scope/],
  },
  { hint: DebugHint.CHECK_RESOURCE, patterns: [/\b404\b/, /not found/] },
  {
    hint: DebugHint.RATE_LIMITED,
    patterns: [/\b429\b/, /rate limit/, /too many requests/],
  },
  { hint: DebugHint.TIMEOUT, patterns: errorExplanation.timeoutPatterns() },
  {
    hint: DebugHint.CHECK_NETWORK,
    patterns: [
      /enotfound/,
      /econnrefused/,
      /econnreset/,
      /getaddrinfo/,
      /fetch failed/,
      /network error/,
    ],
  },
  {
    hint: DebugHint.CHECK_INPUT,
    patterns: [/\b400\b/, /\b422\b/, /bad request/, /validation/],
  },
];

export type DebugNodeRow = {
  stepName: string;
  displayName: string;
  displayNumber: string;
  status: DebugNodeStatus;
  durationMs: number | null;
};
