import {
  KeyPathError,
  scheduleUtils,
  triggerRunSettingsUtils,
} from '@fema-ipaas/shared';

function issuesOf(settings: TriggerSettingsShape): TriggerSettingsIssue[] {
  return [
    ...dedupeIssues(settings),
    ...orderKeyIssues(settings),
    ...cronIssues(settings),
  ];
}

function dedupeIssues(settings: TriggerSettingsShape): TriggerSettingsIssue[] {
  const dedupe = settings.dedupe;
  if (dedupe === undefined || !dedupe.enabled) {
    return [];
  }
  const error = triggerRunSettingsUtils.validateKeyPath(dedupe.keyPath);
  return error === null
    ? []
    : [{ path: ['dedupe', 'keyPath'], message: KEY_MESSAGES[error] }];
}

function orderKeyIssues(
  settings: TriggerSettingsShape,
): TriggerSettingsIssue[] {
  const path = settings.concurrency?.orderKeyPath ?? '';
  if (path.trim().length === 0) {
    return [];
  }
  return triggerRunSettingsUtils.validateKeyPath(path) === null
    ? []
    : [
        {
          path: ['concurrency', 'orderKeyPath'],
          message: 'orderKeyMustReferenceTrigger',
        },
      ];
}

function cronIssues(settings: TriggerSettingsShape): TriggerSettingsIssue[] {
  if (
    !scheduleUtils.isScheduleConnector(settings.connectorName) ||
    settings.triggerName !== 'cron_expression'
  ) {
    return [];
  }
  const input = settings.input;
  const cron =
    typeof input === 'object' && input !== null && 'cronExpression' in input
      ? input.cronExpression
      : undefined;
  if (typeof cron !== 'string' || cron.trim().length === 0) {
    return [];
  }
  return scheduleUtils.validateCron(cron)
    ? []
    : [{ path: ['input', 'cronExpression'], message: 'cronExpressionInvalid' }];
}

export const triggerSettingsValidation = {
  issuesOf,
};

const KEY_MESSAGES: Record<KeyPathError, string> = {
  [KeyPathError.EMPTY]: 'dedupeKeyRequired',
  [KeyPathError.INVALID]: 'dedupeKeyInvalid',
  [KeyPathError.NOT_TRIGGER_OUTPUT]: 'dedupeKeyMustReferenceTrigger',
};

export type TriggerSettingsShape = {
  connectorName?: string;
  triggerName?: string;
  input?: unknown;
  dedupe?: { enabled: boolean; keyPath: string };
  concurrency?: { orderKeyPath?: string };
};

export type TriggerSettingsIssue = {
  path: string[];
  message: string;
};
