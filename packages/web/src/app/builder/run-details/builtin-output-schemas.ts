import { ConnectorMetadataModel } from '@fema-ipaas/connector-sdk';
import { isNil, isObject } from '@fema-ipaas/core-utils';
import {
  AUTHENTICATION_PROPERTY_NAME,
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import {
  OutputSchema,
  OutputSchemaField,
} from '@/components/custom/smart-output-viewer/types';

function forStep(step: WorkflowAction | WorkflowTrigger): OutputSchema | null {
  switch (step.type) {
    case WorkflowActionType.ROUTER:
      return {
        fields: [
          {
            key: 'branches',
            label: t('Branch results'),
            labelKey: 'branchName',
            listItems: [
              { key: 'branchName', label: t('Branch name') },
              {
                key: 'evaluation',
                label: t('Branch matched'),
                format: 'boolean',
              },
              { key: 'branchIndex', label: t('Branch number') },
            ],
          },
        ],
      };
    case WorkflowActionType.LOOP_ON_ITEMS:
      return {
        fields: [
          { key: 'item', label: t('Loop current item') },
          { key: 'index', label: t('Loop index') },
          { key: 'iterations', label: t('Loop iteration results') },
        ],
      };
    default:
      return null;
  }
}

function displayOutput({
  step,
  output,
}: {
  step: WorkflowAction | WorkflowTrigger;
  output: unknown;
}): unknown {
  if (
    step.type !== WorkflowActionType.ROUTER ||
    !isObject(output) ||
    !Array.isArray(output['branches'])
  ) {
    return output;
  }
  return {
    ...output,
    branches: output['branches'].map((branch: unknown) =>
      isObject(branch) && branch['branchName'] === FALLBACK_BRANCH_NAME
        ? { ...branch, branchName: t('Otherwise') }
        : branch,
    ),
  };
}

function failureOutput(output: unknown): OutputSchema | null {
  if (!isObject(output) || !('errorCode' in output)) {
    return null;
  }
  return {
    fields: FAILURE_OUTPUT_FIELDS.filter(({ key }) => key in output).map(
      ({ key, label, format }) => ({ key, label: t(label), format }),
    ),
  };
}

function inputSchema({
  step,
  connectorModel,
  input,
}: {
  step: WorkflowAction | WorkflowTrigger;
  connectorModel: ConnectorMetadataModel | null | undefined;
  input: unknown;
}): OutputSchema | null {
  if (!isObject(input) || isNil(connectorModel)) {
    return null;
  }
  const props = propsOf({ step, connectorModel });
  const fields: OutputSchemaField[] = Object.keys(input).map((key) => ({
    key,
    label:
      key === AUTHENTICATION_PROPERTY_NAME
        ? t('Connection')
        : props[key]?.displayName ?? key,
  }));
  return { fields };
}

function maskedValueCount(value: unknown): number {
  if (typeof value === 'string') {
    return MASKED_VALUE_PATTERN.test(value) ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + maskedValueCount(item), 0);
  }
  if (isObject(value)) {
    return Object.values(value).reduce<number>(
      (sum, item) => sum + maskedValueCount(item),
      0,
    );
  }
  return 0;
}

function propsOf({
  step,
  connectorModel,
}: {
  step: WorkflowAction | WorkflowTrigger;
  connectorModel: ConnectorMetadataModel;
}): Record<string, { displayName: string } | undefined> {
  if (step.type === WorkflowActionType.CONNECTOR) {
    return connectorModel.actions[step.settings.actionName ?? '']?.props ?? {};
  }
  if (step.type === WorkflowTriggerType.CONNECTOR) {
    return (
      connectorModel.triggers[step.settings.triggerName ?? '']?.props ?? {}
    );
  }
  return {};
}

const MASKED_VALUE_PATTERN = /\*{3,}|REDACTED/;

const FALLBACK_BRANCH_NAME = 'Otherwise';

const FAILURE_OUTPUT_FIELDS: {
  key: string;
  label: string;
  format?: OutputSchemaField['format'];
}[] = [
  { key: 'errorCode', label: 'Failure error code' },
  { key: 'errorCategory', label: 'Failure category' },
  { key: 'errorMessage', label: 'Failure error message' },
  { key: 'rawMessage', label: 'Failure raw message' },
  { key: 'errorTime', label: 'Failure time' },
  { key: 'errorTimeIso', label: 'Failure time (ISO)', format: 'datetime' },
];

export const builtinOutputSchemas = {
  forStep,
  displayOutput,
  failureOutput,
  inputSchema,
  maskedValueCount,
};
