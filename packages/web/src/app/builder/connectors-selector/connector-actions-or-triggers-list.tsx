import { isNil } from '@fema/core-utils';
import {
  FlowActionType,
  FlowTriggerType,
  TelemetryEventName,
} from '@fema/shared';
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
  CORE_ACTIONS_METADATA,
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
    case FlowActionType.CONNECTOR: {
      const actions = connectorSelectorUtils.removeHiddenActions(
        stepMetadataWithSuggestions,
      );
      return actions.map((action) => ({
        actionOrTrigger: action,
        type: FlowActionType.CONNECTOR,
        connectorMetadata: stepMetadataWithSuggestions,
      }));
    }
    case FlowTriggerType.CONNECTOR: {
      const triggers = Object.values(
        stepMetadataWithSuggestions.suggestedTriggers ?? {},
      );
      return triggers.map((trigger) => ({
        actionOrTrigger: trigger,
        type: FlowTriggerType.CONNECTOR,
        connectorMetadata: stepMetadataWithSuggestions,
      }));
    }
    case FlowActionType.CODE:
    case FlowActionType.LOOP_ON_ITEMS:
    case FlowActionType.ROUTER: {
      return CORE_ACTIONS_METADATA.filter(
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
                    item.type === FlowActionType.CONNECTOR ||
                    item.type === FlowTriggerType.CONNECTOR
                  ) {
                    capture({
                      name: TelemetryEventName.CONNECTOR_SELECTOR_SEARCH,
                      payload: {
                        search: searchQuery,
                        isTrigger: item.type === FlowTriggerType.CONNECTOR,
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
