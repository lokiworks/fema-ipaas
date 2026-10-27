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
} from '@/features/workflows/utils/workflow-validator';

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

  it('blocks on unconfirmed AI steps and only warns about unknown project variables', () => {
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
    expect(result.errorCount).toBe(1);
    expect(result.issues.map((issue) => [issue.code, issue.severity])).toEqual([
      [ValidationCode.AI_PENDING_REVIEW, ValidationSeverity.ERROR],
      [ValidationCode.VARIABLE_MISSING, ValidationSeverity.WARNING],
    ]);
  });

  it('lets the workflow through once the AI step is confirmed', () => {
    const trigger = webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        input: { text: 'hello' },
      }),
    });
    const result = workflowValidator.validate(context(trigger));
    expect(result.issues.map((issue) => issue.code)).not.toContain(
      ValidationCode.AI_PENDING_REVIEW,
    );
    expect(result.errorCount).toBe(0);
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

  it('checks the mapping against the fields of the step it writes to', () => {
    const target = {
      connectorName: '@fema-ipaas/connector-feishu',
      actionName: 'provision_user',
      fields: [
        { name: 'name', label: '姓名', type: 'STRING', required: true },
        { name: 'mobile', label: '手机号', type: 'STRING', required: true },
      ],
    };
    const trigger = webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        connector: '@fema-ipaas/connector-data-mapper',
        actionName: 'map_fields',
        input: {
          mapping: {
            destination: target,
            fields: [
              { id: 'a', target: 'name', source: 'x', transforms: [] },
              { id: 'b', target: 'nickname', source: 'x', transforms: [] },
              {
                id: 'c',
                target: 'birthday',
                source: 'x',
                transforms: [{ type: 'DATE', arg: 'yyyy-MM-dd' }],
              },
            ],
          },
        },
      }),
    });
    const issues = workflowValidator
      .validate(context(trigger, { mappingTableIds: [] }))
      .issues.filter((found) => found.code === ValidationCode.MAPPING_PROBLEM);
    expect(issues.map((found) => found.params['mappingCode']).sort()).toEqual([
      'DATE_PATTERN_INVALID',
      'REQUIRED_UNMAPPED',
      'UNKNOWN_TARGET',
      'UNKNOWN_TARGET',
    ]);
    expect(
      issues.find(
        (found) => found.params['mappingCode'] === 'REQUIRED_UNMAPPED',
      )?.params['target'],
    ).toBe('mobile');
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

  it('stays quiet when a successful debug run executed the write step', () => {
    expect(
      codes({
        ...ctx(writeStep(), feishuWriteSpec),
        debugVerification: { executedStepNames: ['trigger', 'step_1'] },
      }),
    ).toEqual([]);
  });

  it('says the debug run did not reach a write step it skipped', () => {
    expect(
      codes({
        ...ctx(writeStep(), feishuWriteSpec),
        debugVerification: { executedStepNames: ['trigger'] },
      }),
    ).toEqual([ValidationCode.WRITE_NOT_REACHED]);
  });

  it('warns again once there is no debug run that came after the last edit', () => {
    expect(
      codes({
        ...ctx(writeStep(), feishuWriteSpec),
        debugVerification: null,
      }),
    ).toEqual([ValidationCode.WRITE_NOT_TESTED]);
  });
});

describe('HTTP request steps and write warnings', () => {
  const httpSpec: ConnectorSpec = {
    status: ConnectorSpecStatus.LOADED,
    requiresAuth: false,
    actions: {
      send_request: {
        requiresAuth: false,
        classification: 'WRITE',
        props: [],
      },
    },
    triggers: {},
  };
  const httpTrigger = (method: string) =>
    webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        connector: '@fema-ipaas/connector-http',
        actionName: 'send_request',
        input: { method, url: 'https://example.com' },
      }),
    });
  const httpContext = (method: string) =>
    context(httpTrigger(method), {
      connectors: { '@fema-ipaas/connector-http': httpSpec },
    });

  it('treats GET and HEAD requests as reads', () => {
    expect(codes(httpContext('GET'))).toEqual([]);
    expect(codes(httpContext('head'))).toEqual([]);
    expect(
      workflowValidator.writeSteps({
        trigger: httpTrigger('GET'),
        connectors: { '@fema-ipaas/connector-http': httpSpec },
      }),
    ).toEqual([]);
  });

  it('keeps POST requests as writes', () => {
    expect(codes(httpContext('POST'))).toEqual([
      ValidationCode.WRITE_NOT_TESTED,
    ]);
    expect(
      workflowValidator.writeSteps({
        trigger: httpTrigger('POST'),
        connectors: { '@fema-ipaas/connector-http': httpSpec },
      }).length,
    ).toBe(1);
  });
});

describe('workflowValidator.writeSteps', () => {
  const specWith = (
    classifications: Record<string, 'READ' | 'WRITE' | 'DESTRUCTIVE'>,
  ): ConnectorSpec => ({
    status: ConnectorSpecStatus.LOADED,
    requiresAuth: true,
    actions: Object.fromEntries(
      Object.entries(classifications).map(([name, classification]) => [
        name,
        { requiresAuth: true, classification, props: [] },
      ]),
    ),
    triggers: {},
  });

  it('lists the steps that write or destroy data and skips reads', () => {
    const trigger = webhookTrigger({
      nextAction: connectorAction({
        name: 'step_1',
        actionName: 'find',
        nextAction: connectorAction({
          name: 'step_2',
          actionName: 'send',
          nextAction: connectorAction({ name: 'step_3', actionName: 'remove' }),
        }),
      }),
    });
    const steps = workflowValidator.writeSteps({
      trigger,
      connectors: {
        '@fema-ipaas/connector-feishu': specWith({
          find: 'READ',
          send: 'WRITE',
          remove: 'DESTRUCTIVE',
        }),
      },
    });
    expect(steps.map((step) => [step.stepName, step.destructive])).toEqual([
      ['step_2', false],
      ['step_3', true],
    ]);
  });

  it('ignores skipped steps and connectors that are not loaded yet', () => {
    const trigger = webhookTrigger({
      nextAction: {
        ...connectorAction({ name: 'step_1', actionName: 'send' }),
        skip: true,
      },
    });
    expect(
      workflowValidator.writeSteps({
        trigger,
        connectors: {
          '@fema-ipaas/connector-feishu': specWith({ send: 'WRITE' }),
        },
      }),
    ).toEqual([]);
    expect(
      workflowValidator.writeSteps({
        trigger: webhookTrigger({
          nextAction: connectorAction({ name: 'step_1', actionName: 'send' }),
        }),
        connectors: {},
      }),
    ).toEqual([]);
  });
});
