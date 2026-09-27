import { isNil } from '@fema-ipaas/core-utils';
import {
  StepOutput,
  StepOutputStatus,
  WorkflowTrigger,
  workflowStructureUtil,
} from '@fema-ipaas/shared';

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

function firstFailed(rows: DebugNodeRow[]): DebugNodeRow | null {
  return rows.find((row) => row.status === DebugNodeStatus.FAILED) ?? null;
}

function troubleshootingHints(errorText: string | null): DebugHint[] {
  if (isNil(errorText) || errorText.trim().length === 0) {
    return [];
  }
  const text = errorText.toLowerCase();
  const matched = HINT_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  ).map((rule) => rule.hint);
  return matched.length > 0 ? matched : [DebugHint.READ_MESSAGE];
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
  READ_MESSAGE = 'READ_MESSAGE',
}

const HINT_RULES: { hint: DebugHint; patterns: RegExp[] }[] = [
  {
    hint: DebugHint.CHECK_CONNECTION,
    patterns: [/\b401\b/, /unauthori[sz]ed/, /invalid[_ ]?token/, /expired/],
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
  { hint: DebugHint.TIMEOUT, patterns: [/timeout/, /timed out/, /etimedout/] },
  {
    hint: DebugHint.CHECK_NETWORK,
    patterns: [/enotfound/, /econnrefused/, /econnreset/, /getaddrinfo/],
  },
  {
    hint: DebugHint.CHECK_INPUT,
    patterns: [/\b400\b/, /bad request/, /invalid/, /required/, /validation/],
  },
  {
    hint: DebugHint.CHECK_REFERENCE,
    patterns: [/undefined/, /cannot read propert/, /is not defined/],
  },
];

export type DebugNodeRow = {
  stepName: string;
  displayName: string;
  displayNumber: string;
  status: DebugNodeStatus;
  durationMs: number | null;
};
