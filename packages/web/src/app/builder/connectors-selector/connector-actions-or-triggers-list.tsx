import { isNil } from '@fema-ipaas/core-utils';
import {
  WorkflowActionType,
  WorkflowTriggerType,
  TelemetryEventName,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { MoveLeft } from 'lucide-react';
import React from 'react';

import { CardList } from '@/components/custom/card-list';
import { useTelemetry } from '@/components/providers/telemetry-provider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ConnectorSelectorItem,
  ConnectorSelectorOperation,
  StepMetadataWithSuggestions,
  connectorSelectorUtils,
  getCoreActionsMetadata,
  useConnectorSearchContext,
} from '@/features/connectors';

import { useBuilderStateContext } from '../builder-hooks';

import GenericActionOrTriggerItem from './generic-connector-selector-item';
type ConnectorActionsOrTriggersListProps = {
  hideConnectorIconAndDescription: boolean;
  stepMetadataWithSuggestions: StepMetadataWithSuggestions | null;
  operation: ConnectorSelectorOperation;
};
export const convertStepMetadataToConnectorSelectorItems = (
  stepMetadataWithSuggestions: StepMetadataWithSuggestions,
): ConnectorSelectorItem[] => {
  switch (stepMetadataWithSuggestions.type) {
    case WorkflowActionType.CONNECTOR: {
      const actions = connectorSelectorUtils.removeHiddenActions(
        stepMetadataWithSuggestions,
      );
      return actions.map((action) => ({
        actionOrTrigger: action,
        type: WorkflowActionType.CONNECTOR,
        connectorMetadata: stepMetadataWithSuggestions,
      }));
    }
    case WorkflowTriggerType.CONNECTOR: {
      const triggers = Object.values(
        stepMetadataWithSuggestions.suggestedTriggers ?? {},
      );
      return triggers.map((trigger) => ({
        actionOrTrigger: trigger,
        type: WorkflowTriggerType.CONNECTOR,
        connectorMetadata: stepMetadataWithSuggestions,
      }));
    }
    case WorkflowActionType.CODE:
    case WorkflowActionType.LOOP_ON_ITEMS:
    case WorkflowActionType.ROUTER: {
      return getCoreActionsMetadata().filter(
        (step) => step.type === stepMetadataWithSuggestions.type,
      );
    }
    default: {
      return [];
    }
  }
};

export const ConnectorActionsOrTriggersList: React.FC<
  ConnectorActionsOrTriggersListProps
> = ({
  stepMetadataWithSuggestions,
  hideConnectorIconAndDescription,
  operation,
}) => {
  const { capture } = useTelemetry();
  const { searchQuery } = useConnectorSearchContext();
  const [handleAddingOrUpdatingStep] = useBuilderStateContext((state) => [
    state.handleAddingOrUpdatingStep,
  ]);
  if (isNil(stepMetadataWithSuggestions)) {
    return (
      <div className="flex flex-col gap-2 items-center justify-center h-full w-full">
        <MoveLeft className="w-10 h-10 rtl:rotate-180" />
        <div className="text-sm">{t('Please select a connector first')}</div>
      </div>
    );
  }

  const actionsOrTriggers = convertStepMetadataToConnectorSelectorItems(
    stepMetadataWithSuggestions,
  );
  return (
    <ScrollArea className="h-full" viewPortClassName="h-full">
      <CardList className="min-w-[350px] h-full gap-0" listClassName="gap-0">
        {actionsOrTriggers &&
          actionsOrTriggers.map((item, index) => {
            return (
              <GenericActionOrTriggerItem
                key={index}
                item={item}
                hideConnectorIconAndDescription={
                  hideConnectorIconAndDescription
                }
                stepMetadataWithSuggestions={stepMetadataWithSuggestions}
                onClick={() => {
                  if (
                    item.type === WorkflowActionType.CONNECTOR ||
                    item.type === WorkflowTriggerType.CONNECTOR
                  ) {
                    capture({
                      name: TelemetryEventName.CONNECTOR_SELECTOR_SEARCH,
                      payload: {
                        search: searchQuery,
                        isTrigger: item.type === WorkflowTriggerType.CONNECTOR,
                        selectedActionOrTriggerName: item.actionOrTrigger.name,
                      },
                    });
                  }

                  handleAddingOrUpdatingStep({
                    connectorSelectorItem: item,
                    operation,
                    selectStepAfter: true,
                  });
                }}
              />
            );
          })}
      </CardList>
    </ScrollArea>
  );
};
