import {
  GenericStepOutput,
  StepOutputStatus,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';

import {
  DebugHint,
  DebugNodeStatus,
  debugRecordsUtils,
} from '@/app/builder/debug/debug-records-utils';

const DATE = '2026-05-02T00:00:00.000Z';

const trigger: WorkflowTrigger = {
  name: 'trigger',
  type: WorkflowTriggerType.CONNECTOR,
  valid: true,
  displayName: 'New order',
  lastUpdatedDate: DATE,
  settings: {
    connectorName: '@fema-ipaas/connector-webhook',
    connectorVersion: '0.0.1',
    triggerName: 'catch',
    input: {},
    propertySettings: {},
  },
  nextAction: {
    name: 'step_1',
    type: WorkflowActionType.CONNECTOR,
    valid: true,
    displayName: 'Notify Feishu group',
    lastUpdatedDate: DATE,
    settings: {
      connectorName: '@fema-ipaas/connector-feishu',
      connectorVersion: '0.0.1',
      actionName: 'send',
      input: {},
      propertySettings: {},
      errorHandlingOptions: undefined,
    },
    nextAction: {
      name: 'step_2',
      type: WorkflowActionType.CODE,
      valid: true,
      displayName: 'Format',
      lastUpdatedDate: DATE,
      settings: {
        sourceCode: { code: '', packageJson: '{}' },
        input: {},
        errorHandlingOptions: undefined,
      },
    },
  },
};

const rows = debugRecordsUtils.listNodes({
  trigger,
  outputs: {
    trigger: GenericStepOutput.create({
      type: WorkflowTriggerType.CONNECTOR,
      status: StepOutputStatus.SUCCEEDED,
      input: {},
      output: {},
    }).setDuration(5),
    step_1: GenericStepOutput.create({
      type: WorkflowActionType.CONNECTOR,
      status: StepOutputStatus.FAILED,
      input: {},
    })
      .setErrorMessage('401 Unauthorized')
      .setDuration(20),
  },
  displayNumbers: {
    trigger: 'webhook-trigger-1',
    step_1: 'feishu-1',
    step_2: 'script-1',
  },
});

describe('debugRecordsUtils', () => {
  it('lists every step with its run status', () => {
    expect(rows.map((row) => [row.stepName, row.status])).toEqual([
      ['trigger', DebugNodeStatus.SUCCEEDED],
      ['step_1', DebugNodeStatus.FAILED],
      ['step_2', DebugNodeStatus.NOT_RUN],
    ]);
    expect(debugRecordsUtils.firstFailed(rows)?.stepName).toBe('step_1');
  });

  it('highlights the step selected on the canvas, falling back to the failed one', () => {
    expect(
      debugRecordsUtils.selectedRowName({ rows, selectedStep: 'step_2' }),
    ).toBe('step_2');
    expect(
      debugRecordsUtils.selectedRowName({ rows, selectedStep: null }),
    ).toBe('step_1');
    expect(
      debugRecordsUtils.selectedRowName({ rows, selectedStep: 'gone' }),
    ).toBe('step_1');
    expect(
      debugRecordsUtils.selectedRowName({ rows: [], selectedStep: null }),
    ).toBeNull();
  });

  it('filters by status and by every keyword', () => {
    expect(
      debugRecordsUtils.filterNodes({
        rows,
        status: DebugNodeStatus.FAILED,
        query: '',
      }),
    ).toHaveLength(1);
    expect(
      debugRecordsUtils
        .filterNodes({ rows, status: 'ALL', query: 'feishu notify' })
        .map((row) => row.stepName),
    ).toEqual(['step_1']);
    expect(
      debugRecordsUtils.filterNodes({
        rows,
        status: 'ALL',
        query: 'feishu format',
      }),
    ).toEqual([]);
  });

  it('suggests where to look based on the error', () => {
    expect(debugRecordsUtils.troubleshootingHints('401 Unauthorized')).toEqual([
      DebugHint.CHECK_CONNECTION,
    ]);
    expect(debugRecordsUtils.troubleshootingHints('connect ETIMEDOUT')).toEqual(
      [DebugHint.TIMEOUT],
    );
    expect(
      debugRecordsUtils.troubleshootingHints(
        'ReferenceError: setTimeout is not defined',
      ),
    ).toEqual([DebugHint.CHECK_CODE_NAME]);
    expect(
      debugRecordsUtils.troubleshootingHints(
        "TypeError: Cannot read properties of undefined (reading 'id')",
      ),
    ).toEqual([DebugHint.CHECK_REFERENCE]);
    expect(debugRecordsUtils.troubleshootingHints('something odd')).toEqual([]);
    expect(debugRecordsUtils.troubleshootingHints(null)).toEqual([]);
  });

  it('suggests the step time limit for a step timeout, not an empty reference', () => {
    const friendly = JSON.stringify({
      __apErrorVersion: 1,
      errorName: 'StepTimeoutExceeded',
      message:
        'The step ran longer than 5 seconds and was stopped (FEMA_STEP_TIMEOUT)',
      raw: 'value was undefined',
    });
    expect(debugRecordsUtils.troubleshootingHints(friendly)).toEqual([
      DebugHint.STEP_TIMEOUT,
    ]);
    expect(
      debugRecordsUtils.troubleshootingHints(
        'The step ran longer than 5 seconds and was stopped (FEMA_STEP_TIMEOUT)',
      ),
    ).toEqual([DebugHint.STEP_TIMEOUT]);
  });

  it('reads the hint from the friendly message instead of the raw payload', () => {
    const friendly = JSON.stringify({
      __apErrorVersion: 1,
      message: 'Something odd happened',
      raw: 'Cannot read properties of undefined',
    });
    expect(debugRecordsUtils.troubleshootingHints(friendly)).toEqual([]);
  });
});
