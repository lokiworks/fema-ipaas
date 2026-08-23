import { FlowTriggerType } from '@fema/shared';
import { StoreApi } from 'zustand';

import { RightSideBarType } from '@/app/builder/types';
import { StepMetadataWithSuggestions } from '@/features/connectors';

import { BuilderState } from '../builder-hooks';

export type ConnectorSelectorState = {
  openedConnectorSelectorStepNameOrAddButtonId: string | null;
  setOpenedConnectorSelectorStepNameOrAddButtonId: (
    stepNameOrAddButtonId: string | null,
  ) => void;
  selectedConnectorMetadataInConnectorSelector: StepMetadataWithSuggestions | null;
  setSelectedConnectorMetadataInConnectorSelector: (
    metadata: StepMetadataWithSuggestions | null,
  ) => void;
};

export const createConnectorSelectorState = (
  _: StoreApi<BuilderState>['getState'],
  set: StoreApi<BuilderState>['setState'],
): ConnectorSelectorState => {
  return {
    openedConnectorSelectorStepNameOrAddButtonId: null,
    setOpenedConnectorSelectorStepNameOrAddButtonId: (
      stepNameOrAddButtonId: string | null,
    ) => {
      return set((state) => {
        const isReplacingEmptyTrigger =
          state.flowVersion.trigger.type === FlowTriggerType.EMPTY &&
          stepNameOrAddButtonId === 'trigger';
        return {
          openedConnectorSelectorStepNameOrAddButtonId: stepNameOrAddButtonId,
          rightSidebar: isReplacingEmptyTrigger
            ? RightSideBarType.NONE
            : state.rightSidebar,
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
