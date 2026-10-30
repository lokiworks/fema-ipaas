import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';

import { connectorsHooks } from '@/features/connectors';

import { stepPropertiesSnapshotUtils } from './build-step-properties-snapshot';
import { ErrorExplanationContext } from './explanation-prompt';

export function useStepExplanationContext(
  step: WorkflowAction | WorkflowTrigger | null,
): StepExplanation {
  const connectorStep = isConnectorStep(step) ? step : null;
  const { connectorModel } = connectorsHooks.useConnector({
    name: connectorStep?.settings.connectorName ?? '',
    version: connectorStep?.settings.connectorVersion,
    enabled: !isNil(connectorStep),
  });
  if (isNil(step)) {
    return { context: undefined, connectorDisplayName: undefined };
  }
  const stepKind: 'action' | 'trigger' =
    step.type === WorkflowTriggerType.CONNECTOR ? 'trigger' : 'action';
  const operationName =
    step.type === WorkflowActionType.CONNECTOR
      ? step.settings.actionName
      : step.type === WorkflowTriggerType.CONNECTOR
      ? step.settings.triggerName
      : step.type;
  const input = readRecord(connectorStep?.settings.input);
  return {
    connectorDisplayName: connectorModel?.displayName,
    context: {
      connectorName: connectorStep?.settings.connectorName,
      connectorVersion: connectorStep?.settings.connectorVersion,
      connectorDisplayName: connectorModel?.displayName,
      connectorAuthType:
        stepPropertiesSnapshotUtils.findAuthType(connectorModel),
      stepKind,
      stepName: operationName,
      stepDisplayName: step.displayName,
      stepDescription: stepPropertiesSnapshotUtils.findDescription({
        connectorModel,
        stepKind,
        stepName: operationName,
      }),
      stepProperties: stepPropertiesSnapshotUtils.build({
        connectorModel,
        stepKind,
        stepName: operationName,
        input,
      }),
    },
  };
}

function isConnectorStep(
  step: WorkflowAction | WorkflowTrigger | null,
): step is Extract<
  WorkflowAction | WorkflowTrigger,
  { type: WorkflowActionType.CONNECTOR | WorkflowTriggerType.CONNECTOR }
> {
  return (
    step?.type === WorkflowActionType.CONNECTOR ||
    step?.type === WorkflowTriggerType.CONNECTOR
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || isNil(value) || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value));
}

type StepExplanation = {
  context: ErrorExplanationContext | undefined;
  connectorDisplayName: string | undefined;
};
