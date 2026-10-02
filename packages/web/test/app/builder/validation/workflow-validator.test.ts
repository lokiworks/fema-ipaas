import {
  BranchExecutionType,
  BranchOperator,
  ConnectionStatus,
  RouterExecutionType,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';

import {
  ConnectorSpec,
  ConnectorSpecStatus,
  ValidationCode,
  ValidationContext,
  ValidationSeverity,
  ValidationTab,
  workflowValidator,
} from '@/app/builder/validation/workflow-validator';

const DATE = '2026-05-02T00:00:00.000Z';

function connectorAction({
  name,
  input = {},
  connector = '@fema-ipaas/connector-feishu',
  actionName = 'send',
  nextAction,
  pendingReview,
  sampleData,
  valid = true,
}: {
  name: string;
  input?: Record<string, unknown>;
  connector?: string;
  actionName?: string;
  nextAction?: WorkflowAction;
  pendingReview?: boolean;
  sampleData?: { lastTestDate: string };
  valid?: boolean;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.CONNECTOR,
    valid,
    displayName: name,
    lastUpdatedDate: DATE,
    settings: {
      connectorName: connector,
      connectorVersion: '0.0.1',
      actionName,
      input,
      propertySettings: {},
      errorHandlingOptions: undefined,
      ...(pendingReview ? { pendingReview } : {}),
      ...(sampleData ? { sampleData } : {}),
    },
    nextAction,
  };
}

function loop({
  name,
  items,
  firstLoopAction,
  nextAction,
}: {
  name: string;
  items: string;
  firstLoopAction?: WorkflowAction;
  nextAction?: WorkflowAction;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.LOOP_ON_ITEMS,
    valid: true,
    displayName: name,
    lastUpdatedDate: DATE,
    settings: { items },
    firstLoopAction,
    nextAction,
  };
}

function router({
  name,
  children,
  firstValue = '{{trigger.a}}',
}: {
  name: string;
  children: (WorkflowAction | null)[];
  firstValue?: string;
}): WorkflowAction {
  return {
    name,
    type: WorkflowActionType.ROUTER,
    valid: true,
    displayName: name,
    lastUpdatedDate: DATE,
    settings: {
      executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
      branches: [
        {
          branchName: 'A',
          branchType: BranchExecutionType.CONDITION,
          conditions: [
            [
              {
                firstValue,
                secondValue: 'x',
                operator: BranchOperator.TEXT_CONTAINS,
              },
            ],
          ],
        },
        { branchName: 'Otherwise', branchType: BranchExecutionType.FALLBACK },
      ],
    },
    children,
  };
}

function webhookTrigger({
  nextAction,
  dedupeKey,
}: {
  nextAction?: WorkflowAction;
  dedupeKey?: string;
}): WorkflowTrigger {
  return {
    name: 'trigger',
    type: WorkflowTriggerType.CONNECTOR,
    valid: true,
    displayName: 'Webhook',
    lastUpdatedDate: DATE,
    settings: {
      connectorName: '@fema-ipaas/connector-webhook',
      connectorVersion: '0.0.1',
      triggerName: 'catch',
      input: {},
      propertySettings: {},
      ...(dedupeKey !== undefined
        ? {
            dedupe: {
              enabled: true,
              keyPath: dedupeKey,
              windowSeconds: 3600,
            },
          }
        : {}),
    },
    nextAction,
  };
}

function context(
  trigger: WorkflowTrigger,
  overrides: Partial<ValidationContext> = {},
): ValidationContext {
  return {
    trigger,
    connectors: {},
    connections: {},
    mappingTableIds: [],
    variableNames: [],
    ...overrides,
  };
}

function codes(ctx: ValidationContext): ValidationCode[] {
  return workflowValidator.validate(ctx).issues.map((issue) => issue.code);
}

const feishuWriteSpec: ConnectorSpec = {
  status: ConnectorSpecStatus.LOADED,
  requiresAuth: true,
  actions: {
    send: {
      requiresAuth: true,
      classification: 'WRITE',
      props: [
        { name: 'auth', displayName: 'Connection', required: true },
        { name: 'text', displayName: 'Text', required: true },
      ],
    },
  },
  triggers: {},
};

const feishuSpec: ConnectorSpec = {
  status: ConnectorSpecStatus.LOADED,
  requiresAuth: true,
  actions: {
    send: {
      requiresAuth: true,
      props: [
        { name: 'auth', displayName: 'Connection', required: true },
        { name: 'text', displayName: 'Text', required: true },
      ],
    },
  },
  triggers: {},
};

describe('workflowValidator', () => {
  it('reports a missing trigger', () => {
    const trigger: WorkflowTrigger = {
      name: 'trigger',
      type: WorkflowTriggerType.EMPTY,
      valid: false,
      displayName: 'Select trigger',
      lastUpdatedDate: DATE,
      settings: {},
    };
    expect(codes(context(trigger))).toEqual([
      ValidationCode.TRIGGER_NOT_SELECTED,
    ]);
  });

  it('reports removed connectors and missing required fields', () => {
    const trigger = webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        nextAction: connectorAction({
          name: 'step_2',
          connector: '@fema-ipaas/connector-gone',
        }),
      }),
    });
    const result = codes(
      context(trigger, {
        connectors: {
          '@fema-ipaas/connector-feishu': feishuSpec,
          '@fema-ipaas/connector-gone': { status: ConnectorSpecStatus.MISSING },
        },
      }),
    );
    expect(result).toEqual([
      ValidationCode.CONNECTION_REQUIRED,
      ValidationCode.REQUIRED_FIELD_MISSING,
      ValidationCode.CONNECTOR_UNAVAILABLE,
    ]);
  });

  it('flags connections outside the project and warns on unhealthy ones', () => {
    const trigger = webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        input: { auth: "{{connections['other']}}", text: 'hi' },
        nextAction: connectorAction({
          name: 'step_2',
          input: { auth: "{{connections['broken']}}", text: 'hi' },
        }),
      }),
    });
    const result = workflowValidator.validate(
      context(trigger, {
        connectors: { '@fema-ipaas/connector-feishu': feishuSpec },
        connections: {
          broken: { displayName: 'Broken', status: ConnectionStatus.ERROR },
        },
      }),
    );
    expect(result.errorCount).toBe(1);
    expect(result.warningCount).toBe(1);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      ValidationCode.CONNECTION_UNAVAILABLE,
      ValidationCode.CONNECTION_UNHEALTHY,
    ]);
  });

  it('reports an expired connection as its own warning', () => {
    const trigger = webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        input: { auth: "{{connections['stale']}}", text: 'hi' },
      }),
    });
    const result = workflowValidator.validate(
      context(trigger, {
        connectors: { '@fema-ipaas/connector-feishu': feishuSpec },
        connections: {
          stale: { displayName: 'Stale', status: ConnectionStatus.EXPIRED },
        },
      }),
    );
    const codes = result.issues.map((issue) => issue.code);
    expect(result.errorCount).toBe(0);
    expect(codes).toContain(ValidationCode.CONNECTION_EXPIRED);
    expect(codes).not.toContain(ValidationCode.CONNECTION_UNHEALTHY);
  });

  it('points connection issues at the action tab where the connection is chosen', () => {
    const trigger = webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        input: { text: 'hi' },
        nextAction: connectorAction({
          name: 'step_2',
          input: { auth: "{{connections['other']}}", text: 'hi' },
        }),
      }),
    });
    const result = workflowValidator.validate(
      context(trigger, {
        connectors: { '@fema-ipaas/connector-feishu': feishuSpec },
        connections: {},
      }),
    );
    const connectionIssues = result.issues.filter((issue) =>
      [
        ValidationCode.CONNECTION_REQUIRED,
        ValidationCode.CONNECTION_UNAVAILABLE,
      ].includes(issue.code),
    );
    expect(connectionIssues).toHaveLength(2);
    expect(connectionIssues.map((issue) => issue.tab)).toEqual([
      ValidationTab.ACTION,
      ValidationTab.ACTION,
    ]);
    expect(
      workflowValidator.firstTabWithError({ result, stepName: 'step_1' }),
    ).toBe(ValidationTab.ACTION);
  });

  it('rejects references to later steps, other branches and deleted steps', () => {
    const trigger = webhookTrigger({
      nextAction: router({
        name: 'step_1',
        children: [
          connectorAction({ name: 'step_2', input: { text: '{{trigger.a}}' } }),
          connectorAction({
            name: 'step_3',
            input: { text: "{{step_2['output'].x}} {{step_9.y}}" },
          }),
        ],
      }),
    });
    const result = workflowValidator.validate(context(trigger));
    expect(result.issues.map((issue) => [issue.stepName, issue.code])).toEqual([
      ['step_3', ValidationCode.REFERENCE_NOT_UPSTREAM],
      ['step_3', ValidationCode.REFERENCE_DELETED],
    ]);
    expect(result.issues[0].tab).toBe(ValidationTab.INPUT);
  });

  it('allows loop variables only inside their loop', () => {
    const trigger = webhookTrigger({
      nextAction: loop({
        name: 'step_1',
        items: '{{trigger.items}}',
        firstLoopAction: connectorAction({
          name: 'step_2',
          input: { text: '{{step_1.item.id}}' },
        }),
        nextAction: connectorAction({
          name: 'step_3',
          input: { text: "{{step_1['output'].index}}" },
        }),
      }),
    });
    expect(codes(context(trigger))).toEqual([
      ValidationCode.LOOP_VARIABLE_OUTSIDE_LOOP,
    ]);
  });

  it('checks dedupe keys, cron expressions and branch conditions', () => {
    const cronTrigger: WorkflowTrigger = {
      name: 'trigger',
      type: WorkflowTriggerType.CONNECTOR,
      valid: true,
      displayName: 'Cron',
      lastUpdatedDate: DATE,
      settings: {
        connectorName: '@fema-ipaas/connector-schedule',
        connectorVersion: '0.0.1',
        triggerName: 'cron_expression',
        input: { cronExpression: 'not a cron' },
        propertySettings: {},
      },
      nextAction: router({
        name: 'step_1',
        children: [null, null],
        firstValue: '',
      }),
    };
    expect(codes(context(cronTrigger))).toEqual([
      ValidationCode.CRON_INVALID,
      ValidationCode.BRANCH_CONDITION_INCOMPLETE,
    ]);
    expect(codes(context(webhookTrigger({ dedupeKey: '' })))).toEqual([
      ValidationCode.DEDUPE_NO_KEY,
    ]);
    expect(
      codes(context(webhookTrigger({ dedupeKey: '{{step_1.id}}' }))),
    ).toEqual([ValidationCode.DEDUPE_KEY_INVALID]);
    expect(
      codes(context(webhookTrigger({ dedupeKey: '{{trigger.body.id}}' }))),
    ).toEqual([]);
  });

  it('warns about unconfirmed AI steps and unknown project variables', () => {
    const trigger = webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        pendingReview: true,
        input: { text: '{{variables.region}} {{variables.known}}' },
      }),
    });
    const result = workflowValidator.validate(
      context(trigger, { variableNames: ['known'] }),
    );
    expect(result.errorCount).toBe(0);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      ValidationCode.VARIABLE_MISSING,
      ValidationCode.AI_PENDING_REVIEW,
    ]);
    expect(
      result.issues.every(
        (issue) => issue.severity === ValidationSeverity.WARNING,
      ),
    ).toBe(true);
  });

  it('checks mapping tables and duplicate targets', () => {
    const trigger = webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        connector: '@fema-ipaas/connector-data-mapper',
        actionName: 'map_fields',
        input: {
          mapping: {
            fields: [
              {
                id: 'a',
                target: 'city',
                transforms: [{ type: 'LOOKUP', arg: 'tbl_gone' }],
              },
              { id: 'b', target: 'city', transforms: [] },
            ],
          },
        },
      }),
    });
    expect(codes(context(trigger, { mappingTableIds: ['tbl_ok'] }))).toEqual([
      ValidationCode.MAPPING_DUPLICATE_TARGET,
      ValidationCode.MAPPING_TABLE_MISSING,
    ]);
  });

  it('falls back to the saved valid flag and ignores skipped steps', () => {
    const invalid = connectorAction({ name: 'step_1', valid: false });
    const trigger = webhookTrigger({
      nextAction: {
        ...invalid,
        nextAction: {
          ...connectorAction({ name: 'step_2', valid: false }),
          skip: true,
        },
      },
    });
    const result = workflowValidator.validate(
      context(trigger, {
        connectors: {
          '@fema-ipaas/connector-feishu': {
            ...feishuSpec,
            actions: { send: { requiresAuth: false, props: [] } },
          },
        },
      }),
    );
    expect(result.issues.map((issue) => [issue.stepName, issue.code])).toEqual([
      ['step_1', ValidationCode.STEP_INCOMPLETE],
    ]);
    expect(
      workflowValidator.firstTabWithError({ result, stepName: 'step_1' }),
    ).toBe(ValidationTab.INPUT);
  });
});

describe('untested write steps', () => {
  const writeStep = (sampleData?: { lastTestDate: string }) =>
    webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        input: { auth: "{{connections['feishu']}}", text: 'hi' },
        sampleData,
      }),
    });
  const ctx = (trigger: WorkflowTrigger, spec: ConnectorSpec) =>
    context(trigger, {
      connectors: { '@fema-ipaas/connector-feishu': spec },
      connections: {
        feishu: { displayName: 'Feishu', status: ConnectionStatus.ACTIVE },
      },
    });

  it('warns when a write step has never been tested', () => {
    const result = workflowValidator.validate(
      ctx(writeStep(), feishuWriteSpec),
    );
    expect(result.errorCount).toBe(0);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      ValidationCode.WRITE_NOT_TESTED,
    ]);
    expect(result.issues[0].severity).toBe(ValidationSeverity.WARNING);
    expect(result.issues[0].tab).toBe(ValidationTab.OUTPUT);
  });

  it('warns when the test is older than the last edit', () => {
    expect(
      codes(
        ctx(
          writeStep({ lastTestDate: '2026-05-01T00:00:00.000Z' }),
          feishuWriteSpec,
        ),
      ),
    ).toEqual([ValidationCode.WRITE_NOT_TESTED]);
  });

  it('stays quiet after a test that came after the last edit', () => {
    expect(
      codes(
        ctx(
          writeStep({ lastTestDate: '2026-05-03T00:00:00.000Z' }),
          feishuWriteSpec,
        ),
      ),
    ).toEqual([]);
  });

  it('ignores steps that only read or have no classification', () => {
    expect(codes(ctx(writeStep(), feishuSpec))).toEqual([]);
  });
});
