import {
  WorkflowActionType,
  WorkflowOperationType,
  WorkflowTriggerType,
} from '@fema-ipaas/shared';
import React, { useState } from 'react';

import { CardListItemSkeleton } from '@/components/custom/card-list';
import { Separator } from '@/components/ui/separator';
import { VirtualizedScrollArea } from '@/components/ui/virtualized-scroll-area';
import {
  connectorsHooks,
  ConnectorSelectorTabType,
  useConnectorSelectorTabs,
  ConnectorSelectorOperation,
  StepMetadataWithSuggestions,
  CategorizedStepMetadataWithSuggestions,
  CONNECTOR_SELECTOR_ELEMENTS_HEIGHTS,
  connectorSelectorUtils,
} from '@/features/connectors';
import { useIsMobile } from '@/hooks/use-mobile';

import { cn } from '../../../lib/utils';
import { useBuilderStateContext } from '../builder-hooks';

import { ConnectorActionsOrTriggersList } from './connector-actions-or-triggers-list';
import { ConnectorCardListItem } from './connector-card-item';
import { NoResultsFound } from './no-results-found';

type ConnectorsCardListProps = {
  searchQuery: string;
  operation: ConnectorSelectorOperation;
  stepToReplaceConnectorDisplayName?: string;
};

export const ConnectorsCardList: React.FC<ConnectorsCardListProps> = ({
  searchQuery,
  operation,
  stepToReplaceConnectorDisplayName,
}) => {
  const isMobile = useIsMobile();
  const [selectedConnectorMetadataInConnectorSelector] = useBuilderStateContext(
    (state) => [state.selectedConnectorMetadataInConnectorSelector],
  );
  const { isLoading: isLoadingConnectors, data: categories } =
    connectorsHooks.useConnectorsSearch({
      shouldCaptureEvent: true,
      searchQuery,
      type:
        operation.type === WorkflowOperationType.UPDATE_TRIGGER
          ? 'trigger'
          : 'action',
    });

  const noResultsFound = !isLoadingConnectors && categories.length === 0;
  const [mouseMoved, setMouseMoved] = useState(false);
  const showActionsOrTriggersInsideConnectorsList =
    searchQuery.length > 0 || isMobile;
  const virtualizedItems = transformConnectorsMetadataToVirtualizedItems(
    categories,
    showActionsOrTriggersInsideConnectorsList,
  );

  const initialIndexToScrollToInConnectorsList = virtualizedItems.findIndex(
    (item) => item.displayName === stepToReplaceConnectorDisplayName,
  );
  const { selectedTab } = useConnectorSelectorTabs();

  const isLoading = isLoadingConnectors;
  const showActionsOrTriggersList =
    searchQuery.length === 0 && !isMobile && !noResultsFound && !isLoading;
  const showConnectorsList = !noResultsFound && !isLoading;
  if (
    [
      ConnectorSelectorTabType.EXPLORE,
      ConnectorSelectorTabType.AI_AND_AGENTS,
      ConnectorSelectorTabType.APPROVALS,
    ].includes(selectedTab)
  ) {
    return null;
  }
  return (
    <>
      <div
        onMouseMove={() => {
          setMouseMoved(!isLoadingConnectors);
        }}
        className={cn('w-full md:w-[250px] md:min-w-[250px] transition-all ', {
          'w-full md:w-full': searchQuery.length > 0 || noResultsFound,
        })}
      >
        {isLoading && (
          <div className="flex flex-col gap-2">
            <CardListItemSkeleton numberOfCards={2} withCircle={false} />
          </div>
        )}

        {showConnectorsList && (
          <VirtualizedScrollArea
            key={`${selectedTab}-${searchQuery}`}
            initialScroll={{
              index: initialIndexToScrollToInConnectorsList,
              clickAfterScroll: true,
            }}
            items={virtualizedItems}
            estimateSize={(index) => virtualizedItems[index].height}
            getItemKey={(index) => virtualizedItems[index].id}
            renderItem={(item) => {
              if (item.isCategory) {
                return (
                  <div
                    className={cn('p-2 pb-0 text-sm text-muted-foreground')}
                    id={item.displayName}
                  >
                    {item.displayName}
                  </div>
                );
              }
              return (
                <ConnectorCardListItem
                  connectorMetadata={item.connectorMetadata}
                  searchQuery={searchQuery}
                  operation={operation}
                  isTemporaryDisabledUntilNextCursorMove={!mouseMoved}
                />
              );
            }}
          />
        )}

        {noResultsFound && <NoResultsFound />}
      </div>

      {showActionsOrTriggersList && (
        <>
          <Separator orientation="vertical" className="h-full" />
          <ConnectorActionsOrTriggersList
            stepMetadataWithSuggestions={
              selectedConnectorMetadataInConnectorSelector
            }
            hideConnectorIconAndDescription={false}
            operation={operation}
          />
        </>
      )}
    </>
  );
};

type VirtualizedItem = {
  id: string;
  displayName: string;
  height: number;
} & (
  | {
      isCategory: true;
    }
  | {
      isCategory: false;
      connectorMetadata: StepMetadataWithSuggestions;
    }
);
const transformConnectorsMetadataToVirtualizedItems = (
  searchResult: CategorizedStepMetadataWithSuggestions[],
  showActionsOrTriggersInsideConnectorsList: boolean,
) => {
  return searchResult.reduce<VirtualizedItem[]>((result, category) => {
    if (!showActionsOrTriggersInsideConnectorsList) {
      result.push({
        id: category.title,
        displayName: category.title,
        height: CONNECTOR_SELECTOR_ELEMENTS_HEIGHTS.CATEGORY_ITEM_HEIGHT,
        isCategory: true,
      });
    }
    category.metadata.forEach((connectorMetadata, index) => {
      result.push({
        id: `${connectorMetadata.displayName}-${index}`,
        height: getItemHeight(
          connectorMetadata,
          showActionsOrTriggersInsideConnectorsList,
        ),
        isCategory: false,
        connectorMetadata,
        displayName: connectorMetadata.displayName,
      });
    });
    return result;
  }, []);
};

const getItemHeight = (
  connectorMetadata: StepMetadataWithSuggestions,
  showActionsOrTriggersInsideConnectorsList: boolean,
) => {
  const { ACTION_OR_TRIGGER_ITEM_HEIGHT, CONNECTOR_ITEM_HEIGHT } =
    CONNECTOR_SELECTOR_ELEMENTS_HEIGHTS;
  if (
    connectorMetadata.type === WorkflowActionType.CONNECTOR &&
    showActionsOrTriggersInsideConnectorsList
  ) {
    const actionsListWithoutHiddenActions =
      connectorSelectorUtils.removeHiddenActions(connectorMetadata);
    return (
      ACTION_OR_TRIGGER_ITEM_HEIGHT *
        Object.values(actionsListWithoutHiddenActions).length +
      CONNECTOR_ITEM_HEIGHT
    );
  }
  if (
    connectorMetadata.type === WorkflowTriggerType.CONNECTOR &&
    showActionsOrTriggersInsideConnectorsList
  ) {
    return (
      ACTION_OR_TRIGGER_ITEM_HEIGHT *
        Object.values(connectorMetadata.suggestedTriggers ?? {}).length +
      CONNECTOR_ITEM_HEIGHT
    );
  }
  const isCoreAction =
    connectorMetadata.type === WorkflowActionType.CODE ||
    connectorMetadata.type === WorkflowActionType.LOOP_ON_ITEMS ||
    connectorMetadata.type === WorkflowActionType.ROUTER;
  if (isCoreAction && showActionsOrTriggersInsideConnectorsList) {
    return ACTION_OR_TRIGGER_ITEM_HEIGHT + CONNECTOR_ITEM_HEIGHT;
  }
  return CONNECTOR_ITEM_HEIGHT;
};
