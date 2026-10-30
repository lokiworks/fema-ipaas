import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { stepTestRelevance } from '@/app/builder/state/step-test-relevance';
import { stepTestState } from '@/app/builder/state/step-test-state';
import { StepTestStatus } from '@/features/workflows/utils/workflow-validator';

const EDITED = '2026-05-02T00:00:00.000Z';
const BEFORE_EDIT = '2026-05-01T00:00:00.000Z';
const AFTER_EDIT = '2026-05-03T00:00:00.000Z';

function writeStep({
  text = 'hi',
  lastTestDate,
}: {
  text?: string;
  lastTestDate?: string;
}): WorkflowAction {
  return {
    name: 'step_1',
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: 'Send message',
    lastUpdatedDate: EDITED,
    settings: {
      connectorName: '@fema-ipaas/connector-feishu',
      connectorVersion: '0.0.1',
      actionName: 'send',
      input: { text },
      propertySettings: {},
      errorHandlingOptions: undefined,
      ...(lastTestDate ? { sampleData: { lastTestDate } } : {}),
    },
  };
}

function debugTestedFor({
  step,
  failed = false,
  testedAt = AFTER_EDIT,
}: {
  step: WorkflowAction;
  failed?: boolean;
  testedAt?: string;
}) {
  return { testedAt, failed, signature: stepTestRelevance.signatureOf(step) };
}

describe('stepTestState.statusOf', () => {
  it('is untested without any test evidence', () => {
    expect(
      stepTestState.statusOf({
        step: writeStep({}),
        debugTested: undefined,
        failedInSession: false,
      }),
    ).toBe(StepTestStatus.UNTESTED);
  });

  it('counts a step that succeeded inside a failed debug run as tested', () => {
    const step = writeStep({});
    expect(
      stepTestState.statusOf({
        step,
        debugTested: debugTestedFor({ step }),
        failedInSession: false,
      }),
    ).toBe(StepTestStatus.TESTED);
  });

  it('stays tested when only test-irrelevant edits happened after the debug run', () => {
    const step = writeStep({});
    expect(
      stepTestState.statusOf({
        step,
        debugTested: debugTestedFor({ step, testedAt: BEFORE_EDIT }),
        failedInSession: false,
      }),
    ).toBe(StepTestStatus.TESTED);
  });

  it('turns changed once the step itself is edited after the debug run', () => {
    const tested = writeStep({});
    expect(
      stepTestState.statusOf({
        step: writeStep({ text: 'changed' }),
        debugTested: debugTestedFor({ step: tested }),
        failedInSession: false,
      }),
    ).toBe(StepTestStatus.CHANGED);
  });

  it('reports the failure of the step in the debug run', () => {
    const step = writeStep({});
    expect(
      stepTestState.statusOf({
        step,
        debugTested: debugTestedFor({ step, failed: true }),
        failedInSession: false,
      }),
    ).toBe(StepTestStatus.FAILED);
  });

  it('accepts a single step test that came after the last edit', () => {
    expect(
      stepTestState.statusOf({
        step: writeStep({ lastTestDate: AFTER_EDIT }),
        debugTested: undefined,
        failedInSession: false,
      }),
    ).toBe(StepTestStatus.TESTED);
  });

  it('marks a single step test older than the last edit as changed', () => {
    expect(
      stepTestState.statusOf({
        step: writeStep({ lastTestDate: BEFORE_EDIT }),
        debugTested: undefined,
        failedInSession: false,
      }),
    ).toBe(StepTestStatus.CHANGED);
  });

  it('lets a newer debug failure win over an older single step success', () => {
    const step = writeStep({ lastTestDate: AFTER_EDIT });
    expect(
      stepTestState.statusOf({
        step,
        debugTested: debugTestedFor({
          step,
          failed: true,
          testedAt: '2026-05-04T00:00:00.000Z',
        }),
        failedInSession: false,
      }),
    ).toBe(StepTestStatus.FAILED);
  });
});

describe('stepTestState.statusesOf', () => {
  it('judges every step of the workflow with the same rules', () => {
    const step = writeStep({});
    const trigger: WorkflowTrigger = {
      name: 'trigger',
      type: WorkflowTriggerType.EMPTY,
      valid: true,
      displayName: 'Trigger',
      lastUpdatedDate: EDITED,
      settings: {},
      nextAction: step,
    };
    expect(
      stepTestState.statusesOf({
        trigger,
        debugTestedSteps: { step_1: debugTestedFor({ step }) },
        errorLogs: {},
      }),
    ).toEqual({
      trigger: StepTestStatus.UNTESTED,
      step_1: StepTestStatus.TESTED,
    });
  });
});
