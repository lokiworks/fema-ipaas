import {
  ActionErrorHandlingOptions,
  ERROR_STRATEGY_RETRY_ATTEMPT_OPTIONS,
  ERROR_STRATEGY_RETRY_INTERVAL_OPTIONS,
  ErrorCodeOperator,
  ErrorHandlingRule,
  errorHandlingUtils,
  ErrorOutcome,
  ErrorStrategy,
  ErrorStrategyMode,
  WorkflowAction,
  WorkflowActionType,
} from '@fema-ipaas/shared';

function availableModes({
  hideContinueOnFailure,
  hideRetryOnFailure,
}: {
  hideContinueOnFailure: boolean;
  hideRetryOnFailure: boolean;
}): ErrorStrategyMode[] {
  return MODE_ORDER.filter((mode) => {
    const outcome = errorHandlingUtils.outcomeOf(mode);
    if (hideContinueOnFailure && outcome !== ErrorOutcome.STOP) {
      return false;
    }
    return !(hideRetryOnFailure && errorHandlingUtils.isRetryMode(mode));
  });
}

function buildOptions({
  strategy,
  rules,
}: {
  strategy: ErrorStrategy;
  rules: ErrorHandlingRule[];
}): NonNullable<ActionErrorHandlingOptions> {
  const next = { strategy, rules };
  return {
    ...next,
    continueOnFailure: { value: errorHandlingUtils.usesBranches(next) },
    retryOnFailure: {
      value: errorHandlingUtils.isRetryMode(strategy.mode),
    },
  };
}

function withMode({
  strategy,
  mode,
}: {
  strategy: ErrorStrategy;
  mode: ErrorStrategyMode;
}): ErrorStrategy {
  if (!errorHandlingUtils.isRetryMode(mode)) {
    return { mode };
  }
  return errorHandlingUtils.withRetry({
    mode,
    retryAttempts: strategy.retryAttempts,
    retryIntervalSeconds: strategy.retryIntervalSeconds,
  });
}

function newRule({
  name,
  id,
}: {
  name: string;
  id: string;
}): ErrorHandlingRule {
  return {
    id,
    name,
    operator: ErrorCodeOperator.EQUALS_ANY,
    codes: ['HTTP_429'],
    strategy: errorHandlingUtils.withRetry({
      mode: ErrorStrategyMode.RETRY_THEN_STOP,
    }),
  };
}

function moveRule({
  rules,
  index,
  offset,
}: {
  rules: ErrorHandlingRule[];
  index: number;
  offset: number;
}): ErrorHandlingRule[] {
  const target = index + offset;
  if (target < 0 || target >= rules.length) {
    return rules;
  }
  return rules.map((rule, position) => {
    if (position === index) {
      return rules[target];
    }
    if (position === target) {
      return rules[index];
    }
    return rule;
  });
}

function sameActionSteps({
  step,
  steps,
}: {
  step: WorkflowAction;
  steps: WorkflowAction[];
}): WorkflowAction[] {
  return steps.filter((candidate) => {
    if (candidate.name === step.name || candidate.type !== step.type) {
      return false;
    }
    if (
      candidate.type === WorkflowActionType.CONNECTOR &&
      step.type === WorkflowActionType.CONNECTOR
    ) {
      return (
        candidate.settings.connectorName === step.settings.connectorName &&
        candidate.settings.actionName === step.settings.actionName
      );
    }
    if (
      candidate.type === WorkflowActionType.COMPONENT &&
      step.type === WorkflowActionType.COMPONENT
    ) {
      return candidate.settings.componentType === step.settings.componentType;
    }
    return candidate.type === WorkflowActionType.CODE;
  });
}

function withErrorHandling({
  step,
  options,
}: {
  step: WorkflowAction;
  options: NonNullable<ActionErrorHandlingOptions>;
}): WorkflowAction {
  switch (step.type) {
    case WorkflowActionType.CODE:
      return {
        ...step,
        settings: { ...step.settings, errorHandlingOptions: options },
      };
    case WorkflowActionType.CONNECTOR:
      return {
        ...step,
        settings: { ...step.settings, errorHandlingOptions: options },
      };
    case WorkflowActionType.COMPONENT:
      return {
        ...step,
        settings: { ...step.settings, errorHandlingOptions: options },
      };
    default:
      return step;
  }
}

export const errorHandlingFormUtils = {
  availableModes,
  buildOptions,
  withMode,
  newRule,
  moveRule,
  sameActionSteps,
  withErrorHandling,
  retryAttemptOptions: ERROR_STRATEGY_RETRY_ATTEMPT_OPTIONS,
  retryIntervalOptions: ERROR_STRATEGY_RETRY_INTERVAL_OPTIONS,
};

const MODE_ORDER = [
  ErrorStrategyMode.STOP,
  ErrorStrategyMode.IGNORE,
  ErrorStrategyMode.BRANCH,
  ErrorStrategyMode.RETRY_THEN_STOP,
  ErrorStrategyMode.RETRY_THEN_IGNORE,
  ErrorStrategyMode.RETRY_THEN_BRANCH,
];

export const ERROR_STRATEGY_MODE_LABELS: Record<ErrorStrategyMode, string> = {
  [ErrorStrategyMode.STOP]: 'Stop the run',
  [ErrorStrategyMode.IGNORE]: 'Ignore and continue',
  [ErrorStrategyMode.BRANCH]: 'Add a failure branch',
  [ErrorStrategyMode.RETRY_THEN_STOP]: 'Retry, then stop',
  [ErrorStrategyMode.RETRY_THEN_IGNORE]: 'Retry, then ignore',
  [ErrorStrategyMode.RETRY_THEN_BRANCH]: 'Retry, then add a failure branch',
};

export const ERROR_CODE_OPERATOR_LABELS: Record<ErrorCodeOperator, string> = {
  [ErrorCodeOperator.EQUALS_ANY]: 'Code equals any of',
  [ErrorCodeOperator.NOT_EQUALS_ANY]: 'Code equals none of',
  [ErrorCodeOperator.STARTS_WITH_ANY]: 'Code starts with any of',
  [ErrorCodeOperator.NOT_STARTS_WITH_ANY]: 'Code starts with none of',
};
