import { StoreApi } from 'zustand';

import { LeftSideBarType } from '@/app/builder/types';
import {
  ConnectorSelectorOperation,
  StepMetadataWithSuggestions,
} from '@/features/connectors';

import { BuilderState } from '../builder-hooks';

export const createConnectorSelectorState = (
  _: StoreApi<BuilderState>['getState'],
  set: StoreApi<BuilderState>['setState'],
): ConnectorSelectorState => {
  return {
    openedConnectorSelectorStepNameOrAddButtonId: null,
    connectorSelectorOperation: null,
    connectorSelectorReplacedStepDisplayName: null,
    setOpenedConnectorSelectorStepNameOrAddButtonId: (
      stepNameOrAddButtonId: string | null,
      operation?: ConnectorSelectorOperation,
      replacedStepDisplayName?: string,
    ) => {
      return set((state) => {
        if (stepNameOrAddButtonId === null) {
          return {
            openedConnectorSelectorStepNameOrAddButtonId: null,
            connectorSelectorOperation: null,
            connectorSelectorReplacedStepDisplayName: null,
            selectedConnectorMetadataInConnectorSelector: null,
            leftSidebar:
              state.leftSidebar === LeftSideBarType.CONNECTOR_PICKER
                ? LeftSideBarType.NONE
                : state.leftSidebar,
          };
        }
        return {
          openedConnectorSelectorStepNameOrAddButtonId: stepNameOrAddButtonId,
          connectorSelectorOperation:
            operation ?? state.connectorSelectorOperation,
          connectorSelectorReplacedStepDisplayName:
            replacedStepDisplayName ?? null,
          selectedConnectorMetadataInConnectorSelector: null,
          leftSidebar: LeftSideBarType.CONNECTOR_PICKER,
        };
      });
    },
    selectedConnectorMetadataInConnectorSelector: null,
    setSelectedConnectorMetadataInConnectorSelector: (
      metadata: StepMetadataWithSuggestions | null,
    ) => {
      return set(() => ({
        selectedConnectorMetadataInConnectorSelector: metadata,
      }));
    },
  };
};

export type ConnectorSelectorState = {
  openedConnectorSelectorStepNameOrAddButtonId: string | null;
  connectorSelectorOperation: ConnectorSelectorOperation | null;
  connectorSelectorReplacedStepDisplayName: string | null;
  setOpenedConnectorSelectorStepNameOrAddButtonId: (
    stepNameOrAddButtonId: string | null,
    operation?: ConnectorSelectorOperation,
    replacedStepDisplayName?: string,
  ) => void;
  selectedConnectorMetadataInConnectorSelector: StepMetadataWithSuggestions | null;
  setSelectedConnectorMetadataInConnectorSelector: (
    metadata: StepMetadataWithSuggestions | null,
  ) => void;
};
