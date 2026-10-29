import type {
  ConnectorMetadataModel,
  OutputSchema,
} from '@fema-ipaas/connector-sdk';
import { LocalesEnum, isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowAction,
  WorkflowActionType,
  WorkflowTrigger,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { connectorsApi } from '../api/connectors-api';

import { connectorsHooks } from './connectors-hooks';

function useConnectorOutputSchema({
  connectorName,
  connectorVersion,
  stepName,
}: {
  connectorName?: string;
  connectorVersion?: string;
  stepName?: string;
}): OutputSchema | null {
  const { connectorModel } = connectorsHooks.useConnector({
    name: connectorName ?? '',
    version: connectorVersion,
    enabled: !isNil(connectorName) && !isNil(stepName),
  });

  if (!connectorModel || !stepName) return null;
  const fromTrigger = connectorModel.triggers?.[stepName]?.outputSchema;
  if (fromTrigger) return fromTrigger;
  const fromAction = connectorModel.actions?.[stepName]?.outputSchema;
  if (fromAction) return fromAction;
  return null;
}

function useStepOutputSchemas({
  steps,
}: {
  steps: (WorkflowAction | WorkflowTrigger)[];
}): Record<string, OutputSchema | null> {
  const { i18n } = useTranslation();
  const locale = Object.values(LocalesEnum).find(
    (candidate) => candidate === i18n.language,
  );
  const refs = steps.flatMap(connectorStepRefOf);
  const queries = useQueries({
    queries: refs.map(({ connectorName, connectorVersion }) => ({
      queryKey: ['connector', connectorName, connectorVersion],
      queryFn: (): Promise<ConnectorMetadataModel> =>
        connectorsApi.get({
          name: connectorName,
          version: connectorVersion,
          locale,
        }),
      staleTime: Infinity,
    })),
  });
  return Object.fromEntries(
    refs.map(({ stepName, stepKey }, index) => {
      const connector = queries[index]?.data;
      return [
        stepName,
        connector?.triggers?.[stepKey]?.outputSchema ??
          connector?.actions?.[stepKey]?.outputSchema ??
          null,
      ];
    }),
  );
}

function connectorStepRefOf(
  step: WorkflowAction | WorkflowTrigger,
): ConnectorStepRef[] {
  if (step.type === WorkflowActionType.CONNECTOR && step.settings.actionName) {
    return [
      {
        stepName: step.name,
        connectorName: step.settings.connectorName,
        connectorVersion: step.settings.connectorVersion,
        stepKey: step.settings.actionName,
      },
    ];
  }
  if (
    step.type === WorkflowTriggerType.CONNECTOR &&
    step.settings.triggerName
  ) {
    return [
      {
        stepName: step.name,
        connectorName: step.settings.connectorName,
        connectorVersion: step.settings.connectorVersion,
        stepKey: step.settings.triggerName,
      },
    ];
  }
  return [];
}

export { useConnectorOutputSchema, useStepOutputSchemas };

type ConnectorStepRef = {
  stepName: string;
  connectorName: string;
  connectorVersion: string;
  stepKey: string;
};
