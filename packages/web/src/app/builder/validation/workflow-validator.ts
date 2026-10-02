import { ActionClassification } from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import {
  BranchExecutionType,
  ConnectionStatus,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
  scheduleUtils,
  singleValueConditions,
  triggerRunSettingsUtils,
  workflowReferenceUtil,
} from '@fema-ipaas/shared';

function validate(context: ValidationContext): ValidationResult {
  const steps = collectSteps(context.trigger);
  const stepNames = new Set(steps.map(({ step }) => step.name));
  const loopNames = new Set(
    steps
      .filter(({ step }) => step.type === WorkflowActionType.LOOP_ON_ITEMS)
      .map(({ step }) => step.name),
  );
  const issues = steps
    .filter(({ step }) => !isSkipped(step))
    .flatMap((entry) => validateStep({ entry, context, stepNames, loopNames }));
  return summarize(issues);
}

function summarize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter(
    (issue) => issue.severity === ValidationSeverity.ERROR,
  );
  return {
    issues: [
      ...errors,
      ...issues.filter(
        (issue) => issue.severity === ValidationSeverity.WARNING,
      ),
    ],
    errorCount: errors.length,
    warningCount: issues.length - errors.length,
  };
}

function issuesForStep({
  result,
  stepName,
}: {
  result: ValidationResult;
  stepName: string;
}): ValidationIssue[] {
  return result.issues.filter((issue) => issue.stepName === stepName);
}

function firstTabWithError({
  result,
  stepName,
}: {
  result: ValidationResult;
  stepName: string;
}): ValidationTab | null {
  const errors = issuesForStep({ result, stepName }).filter(
    (issue) => issue.severity === ValidationSeverity.ERROR,
  );
  return (
    TAB_ORDER.find((tab) => errors.some((issue) => issue.tab === tab)) ?? null
  );
}

function collectSteps(trigger: WorkflowTrigger): StepEntry[] {
  const triggerEntry: StepEntry = {
    step: trigger,
    upstream: [],
    loops: [],
  };
  return [
    triggerEntry,
    ...walkChain({
      head: trigger.nextAction,
      upstream: [trigger.name],
      loops: [],
    }),
  ];
}

function walkChain({
  head,
  upstream,
  loops,
}: {
  head: WorkflowAction | undefined | null;
  upstream: string[];
  loops: string[];
}): StepEntry[] {
  if (isNil(head)) {
    return [];
  }
  const own: StepEntry = { step: head, upstream, loops };
  const inside = [...upstream, head.name];
  const children = childChains(head).flatMap((child) =>
    walkChain({
      head: child.head,
      upstream: inside,
      loops: child.isLoop ? [...loops, head.name] : loops,
    }),
  );
  return [
    own,
    ...children,
    ...walkChain({ head: head.nextAction, upstream: inside, loops }),
  ];
}

function childChains(
  step: WorkflowAction,
): { head: WorkflowAction | undefined | null; isLoop: boolean }[] {
  switch (step.type) {
    case WorkflowActionType.LOOP_ON_ITEMS:
      return [{ head: step.firstLoopAction, isLoop: true }];
    case WorkflowActionType.ROUTER:
    case WorkflowActionType.PARALLEL:
      return step.children.map((child) => ({ head: child, isLoop: false }));
    case WorkflowActionType.CODE:
    case WorkflowActionType.CONNECTOR:
    case WorkflowActionType.COMPONENT:
      return [
        { head: step.continueOnFailureBranches?.onSuccess, isLoop: false },
        { head: step.continueOnFailureBranches?.onFailure, isLoop: false },
      ];
  }
}

function validateStep({
  entry,
  context,
  stepNames,
  loopNames,
}: {
  entry: StepEntry;
  context: ValidationContext;
  stepNames: Set<string>;
  loopNames: Set<string>;
}): ValidationIssue[] {
  const { step } = entry;
  const specific = [
    ...structureIssues({ step, context }),
    ...referenceIssues({ entry, context, stepNames, loopNames }),
  ];
  const hasError = specific.some(
    (issue) => issue.severity === ValidationSeverity.ERROR,
  );
  const incomplete =
    !hasError &&
    !step.valid &&
    step.type !== WorkflowTriggerType.EMPTY &&
    connectorIsKnown({ step, context })
      ? [
          issue({
            step,
            code: ValidationCode.STEP_INCOMPLETE,
            tab: ValidationTab.INPUT,
          }),
        ]
      : [];
  const review = isPendingReview(step)
    ? [
        issue({
          step,
          code: ValidationCode.AI_PENDING_REVIEW,
          tab: ValidationTab.ACTION,
          severity: ValidationSeverity.WARNING,
        }),
      ]
    : [];
  const untested = hasError ? [] : untestedWriteIssues({ step, context });
  return [...specific, ...incomplete, ...review, ...untested];
}

function untestedWriteIssues({
  step,
  context,
}: {
  step: WorkflowAction | WorkflowTrigger;
  context: ValidationContext;
}): ValidationIssue[] {
  if (step.type !== WorkflowActionType.CONNECTOR) {
    return [];
  }
  const connector = context.connectors[step.settings.connectorName];
  if (connector?.status !== ConnectorSpecStatus.LOADED) {
    return [];
  }
  const classification =
    connector.actions[step.settings.actionName ?? '']?.classification;
  if (
    classification !== WRITE_CLASSIFICATION &&
    classification !== DESTRUCTIVE_CLASSIFICATION
  ) {
    return [];
  }
  return isTestedAfterLastEdit(step)
    ? []
    : [
        issue({
          step,
          code: ValidationCode.WRITE_NOT_TESTED,
          tab: ValidationTab.OUTPUT,
          severity: ValidationSeverity.WARNING,
          params: { step: step.displayName },
        }),
      ];
}

function isTestedAfterLastEdit(step: WorkflowAction): boolean {
  const lastTestDate = readRecord(step.settings.sampleData)['lastTestDate'];
  if (typeof lastTestDate !== 'string') {
    return false;
  }
  return Date.parse(lastTestDate) >= Date.parse(step.lastUpdatedDate);
}

function structureIssues({
  step,
  context,
}: {
  step: WorkflowAction | WorkflowTrigger;
  context: ValidationContext;
}): ValidationIssue[] {
  switch (step.type) {
    case WorkflowTriggerType.EMPTY:
      return [
        issue({
          step,
          code: ValidationCode.TRIGGER_NOT_SELECTED,
          tab: ValidationTab.ACTION,
        }),
      ];
    case WorkflowTriggerType.CONNECTOR:
      return [
        ...connectorIssues({
          step,
          context,
          operationName: step.settings.triggerName,
          isTrigger: true,
        }),
        ...triggerIssues({ step }),
      ];
    case WorkflowActionType.CONNECTOR:
      return [
        ...connectorIssues({
          step,
          context,
          operationName: step.settings.actionName,
          isTrigger: false,
        }),
        ...agentIssues({ step }),
        ...mappingIssues({ step, context }),
      ];
    case WorkflowActionType.ROUTER:
      return routerIssues({ step });
    case WorkflowActionType.PARALLEL:
      return step.settings.branches.length < 2
        ? [
            issue({
              step,
              code: ValidationCode.PARALLEL_TOO_FEW_BRANCHES,
              tab: ValidationTab.INPUT,
            }),
          ]
        : [];
    case WorkflowActionType.LOOP_ON_ITEMS:
      return isBlank(step.settings.items)
        ? [
            issue({
              step,
              code: ValidationCode.LOOP_ITEMS_EMPTY,
              tab: ValidationTab.INPUT,
            }),
          ]
        : [];
    case WorkflowActionType.CODE:
      return codeIssues({ step });
    case WorkflowActionType.COMPONENT:
      return [];
  }
}

function connectorIssues({
  step,
  context,
  operationName,
  isTrigger,
}: {
  step: WorkflowAction | WorkflowTrigger;
  context: ValidationContext;
  operationName: string | undefined;
  isTrigger: boolean;
}): ValidationIssue[] {
  if (
    step.type !== WorkflowActionType.CONNECTOR &&
    step.type !== WorkflowTriggerType.CONNECTOR
  ) {
    return [];
  }
  const connector = context.connectors[step.settings.connectorName];
  if (connector?.status === ConnectorSpecStatus.MISSING) {
    return [
      issue({
        step,
        code: ValidationCode.CONNECTOR_UNAVAILABLE,
        tab: ValidationTab.ACTION,
      }),
    ];
  }
  if (isBlank(operationName)) {
    return [
      issue({
        step,
        code: ValidationCode.OPERATION_NOT_SELECTED,
        tab: ValidationTab.ACTION,
      }),
    ];
  }
  if (isNil(connector)) {
    return connectionIssues({ step, context, requiresAuth: false });
  }
  const operations = isTrigger ? connector.triggers : connector.actions;
  const operation = operations[operationName ?? ''];
  if (isNil(operation)) {
    return [
      issue({
        step,
        code: ValidationCode.OPERATION_UNAVAILABLE,
        tab: ValidationTab.ACTION,
      }),
    ];
  }
  const input = readRecord(step.settings.input);
  const missing = operation.props
    .filter((prop) => prop.required && prop.name !== AUTH_PROPERTY)
    .filter((prop) => isBlank(input[prop.name]))
    .map((prop) =>
      issue({
        step,
        code: ValidationCode.REQUIRED_FIELD_MISSING,
        tab: ValidationTab.INPUT,
        params: { field: prop.displayName },
      }),
    );
  return [
    ...connectionIssues({
      step,
      context,
      requiresAuth: connector.requiresAuth && operation.requiresAuth,
    }),
    ...missing,
  ];
}

function connectionIssues({
  step,
  context,
  requiresAuth,
}: {
  step: WorkflowAction | WorkflowTrigger;
  context: ValidationContext;
  requiresAuth: boolean;
}): ValidationIssue[] {
  const ids = workflowReferenceUtil.connectionIdsOf(step);
  if (ids.length === 0) {
    const auth = readRecord(step.settings.input)[AUTH_PROPERTY];
    return requiresAuth && isBlank(auth)
      ? [
          issue({
            step,
            code: ValidationCode.CONNECTION_REQUIRED,
            tab: ValidationTab.INPUT,
          }),
        ]
      : [];
  }
  if (isNil(context.connections)) {
    return [];
  }
  const connections = context.connections;
  return ids.flatMap((externalId) => {
    const connection = connections[externalId];
    if (isNil(connection)) {
      return [
        issue({
          step,
          code: ValidationCode.CONNECTION_UNAVAILABLE,
          tab: ValidationTab.INPUT,
          params: { connection: externalId },
        }),
      ];
    }
    return connection.status === ConnectionStatus.ACTIVE
      ? []
      : [
          issue({
            step,
            code: ValidationCode.CONNECTION_UNHEALTHY,
            tab: ValidationTab.INPUT,
            severity: ValidationSeverity.WARNING,
            params: { connection: connection.displayName },
          }),
        ];
  });
}

function triggerIssues({ step }: { step: WorkflowTrigger }): ValidationIssue[] {
  if (step.type !== WorkflowTriggerType.CONNECTOR) {
    return [];
  }
  const { connectorName, triggerName, dedupe } = step.settings;
  const input = readRecord(step.settings.input);
  const cron =
    scheduleUtils.isScheduleConnector(connectorName) &&
    triggerName === CRON_TRIGGER &&
    !isBlank(input['cronExpression']) &&
    !scheduleUtils.validateCron(String(input['cronExpression']))
      ? [
          issue({
            step,
            code: ValidationCode.CRON_INVALID,
            tab: ValidationTab.INPUT,
          }),
        ]
      : [];
  const interval =
    scheduleUtils.isScheduleConnector(connectorName) &&
    triggerName === INTERVAL_TRIGGER &&
    !isBlank(input['minutes']) &&
    !(Number(input['minutes']) > 0)
      ? [
          issue({
            step,
            code: ValidationCode.SCHEDULE_INTERVAL_INVALID,
            tab: ValidationTab.INPUT,
          }),
        ]
      : [];
  const form =
    connectorName === FORMS_CONNECTOR &&
    triggerName === FORM_TRIGGER &&
    (!Array.isArray(input['inputs']) || input['inputs'].length === 0)
      ? [
          issue({
            step,
            code: ValidationCode.FORM_NO_FIELDS,
            tab: ValidationTab.INPUT,
          }),
        ]
      : [];
  const dedupeError =
    dedupe?.enabled === true
      ? triggerRunSettingsUtils.validateKeyPath(dedupe.keyPath)
      : null;
  const dedupeIssues = isNil(dedupeError)
    ? []
    : [
        issue({
          step,
          code:
            dedupeError === DEDUPE_EMPTY
              ? ValidationCode.DEDUPE_NO_KEY
              : ValidationCode.DEDUPE_KEY_INVALID,
          tab: ValidationTab.ERROR,
        }),
      ];
  return [...cron, ...interval, ...form, ...dedupeIssues];
}

function agentIssues({ step }: { step: WorkflowAction }): ValidationIssue[] {
  if (
    step.type !== WorkflowActionType.CONNECTOR ||
    step.settings.connectorName !== AI_CONNECTOR ||
    step.settings.actionName !== AGENT_ACTION
  ) {
    return [];
  }
  const input = readRecord(step.settings.input);
  const servers = input['mcpServers'];
  const noTools = !Array.isArray(servers) || servers.length === 0;
  const maxSteps = input['maxSteps'];
  const stepsOutOfRange =
    !isBlank(maxSteps) &&
    typeof maxSteps !== 'string' &&
    !(Number(maxSteps) >= 1 && Number(maxSteps) <= 20);
  return [
    ...(noTools
      ? [
          issue({
            step,
            code: ValidationCode.AGENT_NO_TOOLS,
            tab: ValidationTab.INPUT,
          }),
        ]
      : []),
    ...(stepsOutOfRange
      ? [
          issue({
            step,
            code: ValidationCode.AGENT_STEPS_OUT_OF_RANGE,
            tab: ValidationTab.INPUT,
          }),
        ]
      : []),
  ];
}

function mappingIssues({
  step,
  context,
}: {
  step: WorkflowAction;
  context: ValidationContext;
}): ValidationIssue[] {
  if (
    step.type !== WorkflowActionType.CONNECTOR ||
    step.settings.connectorName !== DATA_MAPPER_CONNECTOR ||
    step.settings.actionName !== MAP_FIELDS_ACTION
  ) {
    return [];
  }
  const fields = readMappingFields(readRecord(step.settings.input)['mapping']);
  const targets = fields
    .map((field) => field.target.trim())
    .filter((target) => target.length > 0);
  const duplicates = [
    ...new Set(
      targets.filter((target, index) => targets.indexOf(target) !== index),
    ),
  ].map((field) =>
    issue({
      step,
      code: ValidationCode.MAPPING_DUPLICATE_TARGET,
      tab: ValidationTab.INPUT,
      params: { field },
    }),
  );
  const knownTables = context.mappingTableIds;
  const missingTables = isNil(knownTables)
    ? []
    : [
        ...new Set(
          fields
            .flatMap((field) => field.tableIds)
            .filter((tableId) => !knownTables.includes(tableId)),
        ),
      ].map((table) =>
        issue({
          step,
          code: ValidationCode.MAPPING_TABLE_MISSING,
          tab: ValidationTab.INPUT,
          params: { table },
        }),
      );
  return [...duplicates, ...missingTables];
}

function routerIssues({ step }: { step: WorkflowAction }): ValidationIssue[] {
  if (step.type !== WorkflowActionType.ROUTER) {
    return [];
  }
  return step.settings.branches.flatMap((branch) => {
    if (branch.branchType !== BranchExecutionType.CONDITION) {
      return [];
    }
    const conditions = branch.conditions.flat();
    if (conditions.length === 0) {
      return [
        issue({
          step,
          code: ValidationCode.BRANCH_NO_CONDITION,
          tab: ValidationTab.INPUT,
          params: { branch: branch.branchName },
        }),
      ];
    }
    const incomplete = conditions.some((condition) => {
      const needsSecond =
        isNil(condition.operator) ||
        !singleValueConditions.includes(condition.operator);
      const second = 'secondValue' in condition ? condition.secondValue : '';
      return isBlank(condition.firstValue) || (needsSecond && isBlank(second));
    });
    return incomplete
      ? [
          issue({
            step,
            code: ValidationCode.BRANCH_CONDITION_INCOMPLETE,
            tab: ValidationTab.INPUT,
            params: { branch: branch.branchName },
          }),
        ]
      : [];
  });
}

function codeIssues({ step }: { step: WorkflowAction }): ValidationIssue[] {
  if (step.type !== WorkflowActionType.CODE) {
    return [];
  }
  const empty = isBlank(step.settings.sourceCode.code)
    ? [
        issue({
          step,
          code: ValidationCode.CODE_EMPTY,
          tab: ValidationTab.INPUT,
        }),
      ]
    : [];
  const unnamed = Object.keys(step.settings.input).some(
    (name) => name.trim().length === 0,
  )
    ? [
        issue({
          step,
          code: ValidationCode.CODE_INPUT_NAME_EMPTY,
          tab: ValidationTab.INPUT,
        }),
      ]
    : [];
  return [...empty, ...unnamed];
}

function referenceIssues({
  entry,
  context,
  stepNames,
  loopNames,
}: {
  entry: StepEntry;
  context: ValidationContext;
  stepNames: Set<string>;
  loopNames: Set<string>;
}): ValidationIssue[] {
  const { step, upstream, loops } = entry;
  if (step.type === WorkflowTriggerType.EMPTY) {
    return [];
  }
  const settings = readRecord(step.settings);
  const references = workflowReferenceUtil.extractFromValue(
    REFERENCE_SETTINGS.map((key) => settings[key]),
  );
  const unique = [
    ...new Map(
      references.map((reference) => [
        `${reference.root}|${reference.path.join('.')}`,
        reference,
      ]),
    ).values(),
  ];
  return unique.flatMap((reference) => {
    const ref = reference.token;
    if (reference.root === VARIABLES_ROOT) {
      const name = reference.path[0];
      const known = context.variableNames;
      return !isNil(known) && !isNil(name) && !known.includes(name)
        ? [
            issue({
              step,
              code: ValidationCode.VARIABLE_MISSING,
              tab: ValidationTab.INPUT,
              severity: ValidationSeverity.WARNING,
              params: { name },
            }),
          ]
        : [];
    }
    if (stepNames.has(reference.root)) {
      if (!upstream.includes(reference.root)) {
        return [
          issue({
            step,
            code: ValidationCode.REFERENCE_NOT_UPSTREAM,
            tab: ValidationTab.INPUT,
            params: { ref },
          }),
        ];
      }
      const loopVariable =
        workflowReferenceUtil.stepOutputPath(reference.path)[0] ?? '';
      const outsideLoop =
        loopNames.has(reference.root) &&
        LOOP_VARIABLES.includes(loopVariable) &&
        !loops.includes(reference.root);
      return outsideLoop
        ? [
            issue({
              step,
              code: ValidationCode.LOOP_VARIABLE_OUTSIDE_LOOP,
              tab: ValidationTab.INPUT,
              params: { ref },
            }),
          ]
        : [];
    }
    return STEP_NAME_PATTERN.test(reference.root)
      ? [
          issue({
            step,
            code: ValidationCode.REFERENCE_DELETED,
            tab: ValidationTab.INPUT,
            params: { ref },
          }),
        ]
      : [];
  });
}

function connectorIsKnown({
  step,
  context,
}: {
  step: WorkflowAction | WorkflowTrigger;
  context: ValidationContext;
}): boolean {
  if (
    step.type !== WorkflowActionType.CONNECTOR &&
    step.type !== WorkflowTriggerType.CONNECTOR
  ) {
    return true;
  }
  return !isNil(context.connectors[step.settings.connectorName]);
}

function readMappingFields(
  mapping: unknown,
): { target: string; tableIds: string[] }[] {
  const fields = readRecord(mapping)['fields'];
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields.map((field) => {
    const row = readRecord(field);
    const transforms = Array.isArray(row['transforms'])
      ? row['transforms']
      : [];
    const tableIds = transforms
      .map(readRecord)
      .filter(
        (transform) =>
          transform['type'] === LOOKUP_TRANSFORM &&
          typeof transform['arg'] === 'string' &&
          transform['arg'].length > 0,
      )
      .map((transform) => String(transform['arg']));
    return {
      target: typeof row['target'] === 'string' ? row['target'] : '',
      tableIds,
    };
  });
}

function isPendingReview(step: WorkflowAction | WorkflowTrigger): boolean {
  if (step.type === WorkflowTriggerType.EMPTY) {
    return false;
  }
  return step.settings.pendingReview === true;
}

function isSkipped(step: WorkflowAction | WorkflowTrigger): boolean {
  return 'skip' in step && step.skip === true;
}

function isBlank(value: unknown): boolean {
  if (isNil(value)) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || isNil(value) || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value));
}

function issue({
  step,
  code,
  tab,
  severity = ValidationSeverity.ERROR,
  params,
}: {
  step: WorkflowAction | WorkflowTrigger;
  code: ValidationCode;
  tab: ValidationTab;
  severity?: ValidationSeverity;
  params?: Record<string, string>;
}): ValidationIssue {
  return {
    id: `${step.name}:${code}:${JSON.stringify(params ?? {})}`,
    stepName: step.name,
    code,
    tab,
    severity,
    params: params ?? {},
  };
}

export const workflowValidator = {
  validate,
  issuesForStep,
  firstTabWithError,
  collectSteps,
};

const AUTH_PROPERTY = 'auth';
const WRITE_CLASSIFICATION: ActionClassification = 'WRITE';
const DESTRUCTIVE_CLASSIFICATION: ActionClassification = 'DESTRUCTIVE';
const CRON_TRIGGER = 'cron_expression';
const INTERVAL_TRIGGER = 'every_x_minutes';
const FORMS_CONNECTOR = '@fema-ipaas/connector-forms';
const FORM_TRIGGER = 'form_submission';
const AI_CONNECTOR = '@fema-ipaas/connector-ai';
const AGENT_ACTION = 'run_agent';
const DATA_MAPPER_CONNECTOR = '@fema-ipaas/connector-data-mapper';
const MAP_FIELDS_ACTION = 'map_fields';
const LOOKUP_TRANSFORM = 'LOOKUP';
const DEDUPE_EMPTY = 'EMPTY';
const VARIABLES_ROOT = 'variables';
const LOOP_VARIABLES = ['item', 'index'];
const STEP_NAME_PATTERN = /^(trigger|step_\d+)$/;
const REFERENCE_SETTINGS = ['input', 'items', 'branches'];

export enum ValidationSeverity {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
}

export enum ValidationTab {
  ACTION = 'action',
  INPUT = 'input',
  OUTPUT = 'output',
  ERROR = 'error',
}

const TAB_ORDER = [
  ValidationTab.ACTION,
  ValidationTab.INPUT,
  ValidationTab.ERROR,
  ValidationTab.OUTPUT,
];

export enum ValidationCode {
  TRIGGER_NOT_SELECTED = 'TRIGGER_NOT_SELECTED',
  OPERATION_NOT_SELECTED = 'OPERATION_NOT_SELECTED',
  CONNECTOR_UNAVAILABLE = 'CONNECTOR_UNAVAILABLE',
  OPERATION_UNAVAILABLE = 'OPERATION_UNAVAILABLE',
  CONNECTION_REQUIRED = 'CONNECTION_REQUIRED',
  CONNECTION_UNAVAILABLE = 'CONNECTION_UNAVAILABLE',
  CONNECTION_UNHEALTHY = 'CONNECTION_UNHEALTHY',
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  STEP_INCOMPLETE = 'STEP_INCOMPLETE',
  MAPPING_TABLE_MISSING = 'MAPPING_TABLE_MISSING',
  MAPPING_DUPLICATE_TARGET = 'MAPPING_DUPLICATE_TARGET',
  CRON_INVALID = 'CRON_INVALID',
  SCHEDULE_INTERVAL_INVALID = 'SCHEDULE_INTERVAL_INVALID',
  FORM_NO_FIELDS = 'FORM_NO_FIELDS',
  DEDUPE_NO_KEY = 'DEDUPE_NO_KEY',
  DEDUPE_KEY_INVALID = 'DEDUPE_KEY_INVALID',
  BRANCH_NO_CONDITION = 'BRANCH_NO_CONDITION',
  BRANCH_CONDITION_INCOMPLETE = 'BRANCH_CONDITION_INCOMPLETE',
  PARALLEL_TOO_FEW_BRANCHES = 'PARALLEL_TOO_FEW_BRANCHES',
  LOOP_ITEMS_EMPTY = 'LOOP_ITEMS_EMPTY',
  CODE_EMPTY = 'CODE_EMPTY',
  CODE_INPUT_NAME_EMPTY = 'CODE_INPUT_NAME_EMPTY',
  AGENT_NO_TOOLS = 'AGENT_NO_TOOLS',
  AGENT_STEPS_OUT_OF_RANGE = 'AGENT_STEPS_OUT_OF_RANGE',
  REFERENCE_NOT_UPSTREAM = 'REFERENCE_NOT_UPSTREAM',
  REFERENCE_DELETED = 'REFERENCE_DELETED',
  LOOP_VARIABLE_OUTSIDE_LOOP = 'LOOP_VARIABLE_OUTSIDE_LOOP',
  VARIABLE_MISSING = 'VARIABLE_MISSING',
  AI_PENDING_REVIEW = 'AI_PENDING_REVIEW',
  WRITE_NOT_TESTED = 'WRITE_NOT_TESTED',
}

export enum ConnectorSpecStatus {
  LOADED = 'LOADED',
  MISSING = 'MISSING',
}

export type PropSpec = {
  name: string;
  displayName: string;
  required: boolean;
};

export type OperationSpec = {
  requiresAuth: boolean;
  classification?: ActionClassification;
  props: PropSpec[];
};

export type ConnectorSpec =
  | { status: ConnectorSpecStatus.MISSING }
  | {
      status: ConnectorSpecStatus.LOADED;
      requiresAuth: boolean;
      actions: Record<string, OperationSpec>;
      triggers: Record<string, OperationSpec>;
    };

export type ConnectionSpec = {
  displayName: string;
  status: ConnectionStatus;
};

export type ValidationContext = {
  trigger: WorkflowTrigger;
  connectors: Record<string, ConnectorSpec | undefined>;
  connections: Record<string, ConnectionSpec | undefined> | null;
  mappingTableIds: string[] | null;
  variableNames: string[] | null;
};

export type ValidationIssue = {
  id: string;
  stepName: string;
  code: ValidationCode;
  tab: ValidationTab;
  severity: ValidationSeverity;
  params: Record<string, string>;
};

export type ValidationResult = {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
};

type StepEntry = {
  step: WorkflowAction | WorkflowTrigger;
  upstream: string[];
  loops: string[];
};
