import {
  ConnectorSelectorOperation,
  StepMetadataWithSuggestions,
} from '@/features/connectors';

import { useBuilderStateContext } from '../builder-hooks';

import { directPickItemOf } from './connector-actions-or-triggers-list';

export function usePickConnector({
  operation,
}: {
  operation: ConnectorSelectorOperation;
}) {
  const [setSelected, handleAddingOrUpdatingStep] = useBuilderStateContext(
    (state) => [
      state.setSelectedConnectorMetadataInConnectorSelector,
      state.handleAddingOrUpdatingStep,
    ],
  );
  return (connectorMetadata: StepMetadataWithSuggestions) => {
    const directItem = directPickItemOf(connectorMetadata);
    if (directItem === null) {
      setSelected(connectorMetadata);
      return;
    }
    handleAddingOrUpdatingStep({
      connectorSelectorItem: directItem,
      operation,
      selectStepAfter: true,
    });
  };
}
