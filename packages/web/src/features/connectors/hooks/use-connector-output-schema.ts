import type { OutputSchema } from '@fema/connector-sdk';
import { isNil } from '@fema/core-utils';

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

export { useConnectorOutputSchema };
