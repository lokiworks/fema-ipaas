import { FlowOperationType } from '@fema/shared';

import {
  ConnectorSelectorOperation,
  ConnectorSelectorConnectorItem,
  connectorSelectorUtils,
} from '@/features/connectors';

import { BuilderState } from '../builder-hooks';

export const handleAddingOrUpdatingCustomAgentConnectorSelectorItem = (
  agentConnectorSelectorItem: ConnectorSelectorConnectorItem,
  operation: ConnectorSelectorOperation,
  handleAddingOrUpdatingStep: BuilderState['handleAddingOrUpdatingStep'],
) => {
  const stepName = handleAddingOrUpdatingStep({
    connectorSelectorItem: agentConnectorSelectorItem,
    operation,
    selectStepAfter: true,
  });
  const defaultValues = connectorSelectorUtils.getDefaultStepValues({
    stepName,
    connectorSelectorItem: agentConnectorSelectorItem,
  });
  return handleAddingOrUpdatingStep({
    connectorSelectorItem: agentConnectorSelectorItem,
    operation: {
      type: FlowOperationType.UPDATE_ACTION,
      stepName,
    },
    selectStepAfter: false,
    overrideSettings: defaultValues.settings,
  });
};
