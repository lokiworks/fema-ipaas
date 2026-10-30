import { isNil } from '@fema-ipaas/core-utils';
import {
  ErrorStrategyMode,
  PropertyExecutionType,
  RouterExecutionType,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import {
  FieldChange,
  StepChangeKind,
  versionDiff,
} from '@/features/releases/utils/version-diff';

function stepRows({
  kind,
  before,
  after,
  context,
}: {
  kind: StepChangeKind;
  before: WorkflowTrigger | WorkflowAction | null;
  after: WorkflowTrigger | WorkflowAction | null;
  context: CompareContext;
}): CompareRow[] {
  const reference = after ?? before;
  const props = context.propsOf(reference);
  const connector = connectorOf(reference);
  const oneSided = kind !== StepChangeKind.MODIFIED;
  return versionDiff
    .fieldChanges({ before, after })
    .flatMap((change) => {
      const field = describeField({ path: change.path, props });
      if (isNil(field)) {
        return [];
      }
      const row: CompareRow = {
        key: change.path,
        group: field.group,
        label: field.label,
        before: formatValue({ raw: change.before, field, context, connector }),
        after: formatValue({ raw: change.after, field, context, connector }),
      };
      return oneSided && isEmptyValue(change.before ?? change.after)
        ? []
        : [row];
    })
    .filter((row) => row.before !== row.after)
    .sort((left, right) => GROUP_ORDER[left.group] - GROUP_ORDER[right.group]);
}

function workflowRows({ changes }: { changes: FieldChange[] }): CompareRow[] {
  return changes.map((change) => ({
    key: change.path,
    group: CompareGroup.BASIC,
    label: change.path === 'stepOrder' ? t('Step order') : t('Workflow name'),
    before: change.before ?? EMPTY,
    after: change.after ?? EMPTY,
  }));
}

function readableExpression({
  text,
  stepNames,
  connectionNames,
}: {
  text: string;
  stepNames: Record<string, string>;
  connectionNames: Record<string, string>;
}): string {
  return text.replace(/\{\{([\s\S]*?)\}\}/g, (_match, body: string) => {
    const connection = CONNECTION_PATTERN.exec(body.trim());
    if (!isNil(connection)) {
      return t('Connection {name}', {
        name: connectionNames[connection[1]] ?? connection[1],
      });
    }
    const readable = body
      .trim()
      .replace(/^([A-Za-z_][A-Za-z0-9_]*)/, (name: string) =>
        isNil(stepNames[name]) ? name : `「${stepNames[name]}」`,
      )
      .replace(/\[['"]output['"]\]/, '')
      .replace(/\[['"]([^'"\]]+)['"]\]/g, '.$1')
      .replace(/\[(\d+)\]/g, '[$1]');
    return `{${readable}}`;
  });
}

function describeField({
  path,
  props,
}: {
  path: string;
  props: Record<string, PropLabelSource>;
}): FieldDescription | null {
  const segments = path.split('.');
  const [root, section, name, ...rest] = segments;
  if (path === 'displayName') {
    return basic({ label: t('Step name') });
  }
  if (path === 'skip') {
    return basic({ label: t('Skip this step'), kind: ValueKind.BOOLEAN });
  }
  if (path === 'type') {
    return basic({ label: t('Step type'), kind: ValueKind.STEP_TYPE });
  }
  if (root !== 'settings') {
    return other({ path });
  }
  switch (section) {
    case 'connectorName':
      return basic({ label: t('Connector'), kind: ValueKind.CONNECTOR });
    case 'connectorVersion':
      return basic({ label: t('Connector version') });
    case 'actionName':
    case 'triggerName':
      return basic({ label: t('Operation'), kind: ValueKind.OPERATION });
    case 'componentType':
      return basic({ label: t('Component'), kind: ValueKind.COMPONENT });
    case 'input':
      return inputField({ name, rest, props });
    case 'propertySettings':
      return rest[0] === 'type' && rest.length === 1
        ? {
            group: CompareGroup.INPUT,
            label: t('{field} input mode', {
              field: props[name]?.displayName ?? name,
            }),
            kind: ValueKind.INPUT_MODE,
            options: [],
          }
        : null;
    case 'errorHandlingOptions':
      return errorHandlingField({ name, rest });
    case 'branches':
      return {
        group: CompareGroup.LOGIC,
        label: t('Branches'),
        kind: ValueKind.BRANCHES,
        options: [],
      };
    case 'executionType':
      return {
        group: CompareGroup.LOGIC,
        label: t('Which branches run'),
        kind: ValueKind.ROUTER_MODE,
        options: [],
      };
    case 'items':
      return {
        group: CompareGroup.LOGIC,
        label: t('Loop over'),
        kind: ValueKind.TEXT,
        options: [],
      };
    case 'sourceCode':
      return {
        group: CompareGroup.LOGIC,
        label: name === 'packageJson' ? t('Dependencies') : t('Code'),
        kind: ValueKind.CODE,
        options: [],
      };
    case 'sensitiveOutput':
      return basic({
        label: t('Output contains sensitive information'),
        kind: ValueKind.BOOLEAN,
      });
    case 'customLogoUrl':
      return basic({ label: t('Icon') });
    case 'dedupe':
    case 'concurrency':
    case 'scheduleOverlap':
    case 'skipHolidays':
      return runSettingField({ section, name });
    default:
      return other({ path });
  }
}

function inputField({
  name,
  rest,
  props,
}: {
  name: string | undefined;
  rest: string[];
  props: Record<string, PropLabelSource>;
}): FieldDescription {
  if (isNil(name)) {
    return {
      group: CompareGroup.INPUT,
      label: t('Input'),
      kind: ValueKind.TEXT,
      options: [],
    };
  }
  const prop = props[name];
  const base =
    name === AUTH_PROPERTY ? t('Connection') : prop?.displayName ?? name;
  return {
    group: CompareGroup.INPUT,
    label: rest.length === 0 ? base : `${base} · ${rest.join('.')}`,
    kind: name === AUTH_PROPERTY ? ValueKind.CONNECTION : ValueKind.TEXT,
    options: rest.length === 0 ? dropdownOptions(prop) : [],
  };
}

function errorHandlingField({
  name,
  rest,
}: {
  name: string | undefined;
  rest: string[];
}): FieldDescription {
  const group = CompareGroup.ERROR_HANDLING;
  const prefix = t('Error handling');
  const describe = (label: string, kind: ValueKind): FieldDescription => ({
    group,
    label: `${prefix} · ${label}`,
    kind,
    options: [],
  });
  if (name === 'continueOnFailure') {
    return describe(t('Add a failure branch'), ValueKind.BOOLEAN);
  }
  if (name === 'retryOnFailure') {
    return describe(t('Retry on Failure'), ValueKind.BOOLEAN);
  }
  if (name === 'rules') {
    return describe(t('Custom strategies'), ValueKind.RULES);
  }
  if (name === 'strategy' && rest[0] === 'retryAttempts') {
    return describe(t('Retry count'), ValueKind.TEXT);
  }
  if (name === 'strategy' && rest[0] === 'retryIntervalSeconds') {
    return describe(t('Retry interval'), ValueKind.SECONDS);
  }
  if (name === 'strategy') {
    return describe(t('Default strategy'), ValueKind.ERROR_MODE);
  }
  return describe(t('Other setting'), ValueKind.TEXT);
}

function runSettingField({
  section,
  name,
}: {
  section: string;
  name: string | undefined;
}): FieldDescription {
  const label = (() => {
    if (section === 'skipHolidays') {
      return t('Skip public holidays');
    }
    if (section === 'scheduleOverlap') {
      return t('When the previous run is still running');
    }
    if (section === 'dedupe') {
      return name === 'enabled'
        ? t('Skip duplicate events')
        : name === 'keyPath'
        ? t('Dedupe key')
        : t('Dedupe window');
    }
    return name === 'orderKeyPath'
      ? t('Order key')
      : t('Maximum concurrent runs');
  })();
  return {
    group: CompareGroup.RUN_SETTINGS,
    label,
    kind:
      section === 'skipHolidays' || name === 'enabled'
        ? ValueKind.BOOLEAN
        : name === 'windowSeconds'
        ? ValueKind.SECONDS
        : ValueKind.TEXT,
    options: [],
  };
}

function formatValue({
  raw,
  field,
  context,
  connector,
}: {
  raw: string | null;
  field: FieldDescription;
  context: CompareContext;
  connector: string | null;
}): string {
  if (isNil(raw) || raw === 'null' || raw.length === 0) {
    return EMPTY;
  }
  const value = (() => {
    switch (field.kind) {
      case ValueKind.BOOLEAN:
        return raw === 'true' ? t('Yes') : raw === 'false' ? t('No') : raw;
      case ValueKind.STEP_TYPE:
        return stepTypeLabel(raw);
      case ValueKind.CONNECTOR:
        return context.connectorName(raw) ?? raw;
      case ValueKind.OPERATION:
        return isNil(connector)
          ? raw
          : context.operationName({ connector, name: raw }) ?? raw;
      case ValueKind.COMPONENT:
        return context.componentName(raw) ?? raw;
      case ValueKind.INPUT_MODE:
        return inputModeLabel(raw);
      case ValueKind.ROUTER_MODE:
        return raw === RouterExecutionType.EXECUTE_ALL_MATCH
          ? t('Run every matching branch')
          : t('Only the first (left) matching branch');
      case ValueKind.ERROR_MODE:
        return errorModeLabel(raw);
      case ValueKind.RULES:
        return t('{count, plural, other {# rules}}', {
          count: parseArray(raw).length,
        });
      case ValueKind.BRANCHES:
        return branchesLabel(raw);
      case ValueKind.SECONDS:
        return t('{count} seconds', { count: Number(raw) });
      case ValueKind.CODE:
        return raw;
      case ValueKind.CONNECTION:
      case ValueKind.TEXT: {
        const option = field.options.find(
          (candidate) => candidate.value === raw,
        );
        return (
          option?.label ??
          readableExpression({
            text: raw,
            stepNames: context.stepNames,
            connectionNames: context.connectionNames,
          })
        );
      }
    }
  })();
  return truncate(value);
}

function connectorOf(
  step: WorkflowTrigger | WorkflowAction | null,
): string | null {
  if (
    isNil(step) ||
    (step.type !== WorkflowActionType.CONNECTOR &&
      step.type !== WorkflowTriggerType.CONNECTOR)
  ) {
    return null;
  }
  return step.settings.connectorName;
}

function stepTypeLabel(raw: string): string {
  switch (raw) {
    case WorkflowActionType.CODE:
      return t('Code');
    case WorkflowActionType.COMPONENT:
      return t('Component');
    case WorkflowActionType.CONNECTOR:
      return t('Connector');
    case WorkflowActionType.LOOP_ON_ITEMS:
      return t('Loop on Items');
    case WorkflowActionType.PARALLEL:
      return t('Parallel');
    case WorkflowActionType.ROUTER:
      return t('Router');
    case WorkflowTriggerType.CONNECTOR:
    case WorkflowTriggerType.EMPTY:
      return t('Trigger');
    default:
      return raw;
  }
}

function inputModeLabel(raw: string): string {
  switch (raw) {
    case PropertyExecutionType.MANUAL:
      return t('Fill in the form');
    case PropertyExecutionType.DYNAMIC:
      return t('Expression');
    default:
      return t('Typed value');
  }
}

function errorModeLabel(raw: string): string {
  switch (raw) {
    case ErrorStrategyMode.STOP:
      return t('Stop the run');
    case ErrorStrategyMode.IGNORE:
      return t('Ignore and continue');
    case ErrorStrategyMode.BRANCH:
      return t('Add a failure branch');
    case ErrorStrategyMode.RETRY_THEN_STOP:
      return t('Retry, then stop');
    case ErrorStrategyMode.RETRY_THEN_IGNORE:
      return t('Retry, then ignore');
    case ErrorStrategyMode.RETRY_THEN_BRANCH:
      return t('Retry, then add a failure branch');
    default:
      return raw;
  }
}

function branchesLabel(raw: string): string {
  const names = parseArray(raw).map((branch, index) => {
    if (typeof branch !== 'object' || branch === null) {
      return t('Branch {index}', { index: index + 1 });
    }
    const name = 'branchName' in branch ? branch.branchName : undefined;
    const conditions =
      'conditions' in branch && Array.isArray(branch.conditions)
        ? branch.conditions.flat().length
        : null;
    const label =
      typeof name !== 'string' || name.length === 0
        ? t('Branch {index}', { index: index + 1 })
        : name === 'Otherwise'
        ? t('Otherwise')
        : name;
    return isNil(conditions)
      ? label
      : t('{branch} ({count, plural, other {# conditions}})', {
          branch: label,
          count: conditions,
        });
  });
  return names.join('、');
}

function dropdownOptions(prop: PropLabelSource | undefined): DropdownOption[] {
  const state = prop?.options;
  if (typeof state !== 'object' || state === null || !('options' in state)) {
    return [];
  }
  const options = state.options;
  if (!Array.isArray(options)) {
    return [];
  }
  return options.flatMap((option: unknown) => {
    if (
      typeof option !== 'object' ||
      option === null ||
      !('label' in option) ||
      !('value' in option) ||
      typeof option.label !== 'string'
    ) {
      return [];
    }
    return [
      {
        label: option.label,
        value:
          typeof option.value === 'string'
            ? option.value
            : JSON.stringify(option.value),
      },
    ];
  });
}

function parseArray(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isEmptyValue(raw: string | null): boolean {
  return (
    isNil(raw) ||
    raw === '' ||
    raw === 'false' ||
    raw === 'null' ||
    raw === '[]' ||
    raw === '{}' ||
    raw === PropertyExecutionType.MANUAL
  );
}

function truncate(value: string): string {
  return value.length > MAX_VALUE_LENGTH
    ? `${value.slice(0, MAX_VALUE_LENGTH)}…`
    : value;
}

function basic({
  label,
  kind = ValueKind.TEXT,
}: {
  label: string;
  kind?: ValueKind;
}): FieldDescription {
  return { group: CompareGroup.BASIC, label, kind, options: [] };
}

function other({ path }: { path: string }): FieldDescription {
  return {
    group: CompareGroup.OTHER,
    label: t('Other setting ({name})', {
      name: path.split('.').slice(-1)[0] ?? path,
    }),
    kind: ValueKind.TEXT,
    options: [],
  };
}

const EMPTY = '—';
const MAX_VALUE_LENGTH = 240;
const AUTH_PROPERTY = 'auth';
const CONNECTION_PATTERN = /^connections\[['"]([^'"\]]+)['"]\]$/;

enum ValueKind {
  TEXT = 'TEXT',
  BOOLEAN = 'BOOLEAN',
  STEP_TYPE = 'STEP_TYPE',
  CONNECTOR = 'CONNECTOR',
  OPERATION = 'OPERATION',
  COMPONENT = 'COMPONENT',
  CONNECTION = 'CONNECTION',
  INPUT_MODE = 'INPUT_MODE',
  ROUTER_MODE = 'ROUTER_MODE',
  ERROR_MODE = 'ERROR_MODE',
  RULES = 'RULES',
  BRANCHES = 'BRANCHES',
  SECONDS = 'SECONDS',
  CODE = 'CODE',
}

export enum CompareGroup {
  BASIC = 'BASIC',
  INPUT = 'INPUT',
  LOGIC = 'LOGIC',
  ERROR_HANDLING = 'ERROR_HANDLING',
  RUN_SETTINGS = 'RUN_SETTINGS',
  OTHER = 'OTHER',
}

const GROUP_ORDER: Record<CompareGroup, number> = {
  [CompareGroup.BASIC]: 0,
  [CompareGroup.INPUT]: 1,
  [CompareGroup.LOGIC]: 2,
  [CompareGroup.ERROR_HANDLING]: 3,
  [CompareGroup.RUN_SETTINGS]: 4,
  [CompareGroup.OTHER]: 5,
};

export const versionCompareRows = {
  stepRows,
  workflowRows,
  readableExpression,
};

export type CompareRow = {
  key: string;
  group: CompareGroup;
  label: string;
  before: string;
  after: string;
};

export type PropLabelSource = {
  displayName: string;
  options?: unknown;
};

export type CompareContext = {
  propsOf: (
    step: WorkflowTrigger | WorkflowAction | null,
  ) => Record<string, PropLabelSource>;
  connectorName: (name: string) => string | null;
  operationName: (params: { connector: string; name: string }) => string | null;
  componentName: (type: string) => string | null;
  stepNames: Record<string, string>;
  connectionNames: Record<string, string>;
};

type FieldDescription = {
  group: CompareGroup;
  label: string;
  kind: ValueKind;
  options: DropdownOption[];
};

type DropdownOption = {
  label: string;
  value: string;
};
