import {
  CodeAction,
  ConnectorAction,
  ErrorCodeOperator,
  ErrorStrategyMode,
  WorkflowActionType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { errorHandlingFormUtils } from '@/app/builder/connector-properties/error-handling-utils';

describe('errorHandlingFormUtils', () => {
  it('hides modes the action does not support', () => {
    expect(
      errorHandlingFormUtils.availableModes({
        hideContinueOnFailure: true,
        hideRetryOnFailure: false,
      }),
    ).toEqual([ErrorStrategyMode.STOP, ErrorStrategyMode.RETRY_THEN_STOP]);
    expect(
      errorHandlingFormUtils.availableModes({
        hideContinueOnFailure: false,
        hideRetryOnFailure: true,
      }),
    ).toEqual([
      ErrorStrategyMode.STOP,
      ErrorStrategyMode.IGNORE,
      ErrorStrategyMode.BRANCH,
    ]);
  });

  it('keeps the legacy flags in step with the strategy so the canvas shows branches', () => {
    const options = errorHandlingFormUtils.buildOptions({
      strategy: { mode: ErrorStrategyMode.STOP },
      rules: [
        {
          id: 'r1',
          name: 'rate limit',
          operator: ErrorCodeOperator.EQUALS_ANY,
          codes: ['HTTP_429'],
          strategy: { mode: ErrorStrategyMode.RETRY_THEN_BRANCH },
        },
      ],
    });
    expect(options.continueOnFailure).toEqual({ value: true });
    expect(options.retryOnFailure).toEqual({ value: false });
  });

  it('fills retry defaults when switching to a retry mode and drops them otherwise', () => {
    expect(
      errorHandlingFormUtils.withMode({
        strategy: { mode: ErrorStrategyMode.STOP },
        mode: ErrorStrategyMode.RETRY_THEN_IGNORE,
      }),
    ).toEqual({
      mode: ErrorStrategyMode.RETRY_THEN_IGNORE,
      retryAttempts: 3,
      retryIntervalSeconds: 10,
    });
    expect(
      errorHandlingFormUtils.withMode({
        strategy: {
          mode: ErrorStrategyMode.RETRY_THEN_STOP,
          retryAttempts: 5,
        },
        mode: ErrorStrategyMode.IGNORE,
      }),
    ).toEqual({ mode: ErrorStrategyMode.IGNORE });
  });

  it('moves rules without mutating the list', () => {
    const rules = ['a', 'b', 'c'].map((id) =>
      errorHandlingFormUtils.newRule({ id, name: id }),
    );
    const moved = errorHandlingFormUtils.moveRule({
      rules,
      index: 2,
      offset: -1,
    });
    expect(moved.map((rule) => rule.id)).toEqual(['a', 'c', 'b']);
    expect(rules.map((rule) => rule.id)).toEqual(['a', 'b', 'c']);
    expect(
      errorHandlingFormUtils.moveRule({ rules, index: 0, offset: -1 }),
    ).toBe(rules);
  });

  it('finds other steps that use the same connector action', () => {
    const source = connectorStep({ name: 'step_1', actionName: 'send' });
    const steps = [
      source,
      connectorStep({ name: 'step_2', actionName: 'send' }),
      connectorStep({ name: 'step_3', actionName: 'create' }),
      codeStep('step_4'),
    ];
    expect(
      errorHandlingFormUtils
        .sameActionSteps({ step: source, steps })
        .map((step) => step.name),
    ).toEqual(['step_2']);
    expect(
      errorHandlingFormUtils
        .sameActionSteps({ step: codeStep('step_5'), steps })
        .map((step) => step.name),
    ).toEqual(['step_4']);
  });
});

function connectorStep({
  name,
  actionName,
}: {
  name: string;
  actionName: string;
}): ConnectorAction {
  return {
    name,
    displayName: name,
    valid: true,
    lastUpdatedDate: '',
    type: WorkflowActionType.CONNECTOR,
    settings: {
      connectorName: '@fema-ipaas/connector-slack',
      connectorVersion: '1.0.0',
      actionName,
      input: {},
      propertySettings: {},
    },
  };
}

function codeStep(name: string): CodeAction {
  return {
    name,
    displayName: name,
    valid: true,
    lastUpdatedDate: '',
    type: WorkflowActionType.CODE,
    settings: {
      input: {},
      sourceCode: { code: '', packageJson: '{}' },
    },
  };
}
