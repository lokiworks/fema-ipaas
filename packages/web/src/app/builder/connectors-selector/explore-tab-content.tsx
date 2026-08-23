import { WorkflowOperationType } from '@fema/shared';

import {
  CardListItem,
  CardListItemSkeleton,
} from '@/components/custom/card-list';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ConnectorIcon,
  connectorsHooks,
  ConnectorSelectorTabType,
  useConnectorSelectorTabs,
  ConnectorSelectorOperation,
} from '@/features/connectors';

import { ConnectorActionsOrTriggersList } from './connector-actions-or-triggers-list';

const ExploreTabContent = ({
  operation,
}: {
  operation: ConnectorSelectorOperation;
}) => {
  const {
    selectedTab,
    selectedConnectorInExplore,
    setSelectedConnectorInExplore,
  } = useConnectorSelectorTabs();
  const { data: categories, isLoading: isLoadingConnectors } =
    connectorsHooks.useConnectorsSearch({
      shouldCaptureEvent: false,
      searchQuery: '',
      type:
        operation.type === WorkflowOperationType.UPDATE_TRIGGER
          ? 'trigger'
          : 'action',
    });
  if (selectedTab !== ConnectorSelectorTabType.EXPLORE) {
    return null;
  }
  if (isLoadingConnectors) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <CardListItemSkeleton numberOfCards={2} withCircle={false} />
      </div>
    );
  }

  if (selectedConnectorInExplore) {
    return (
      <div className="w-full">
        <ConnectorActionsOrTriggersList
          stepMetadataWithSuggestions={selectedConnectorInExplore}
          hideConnectorIconAndDescription={false}
          operation={operation}
        />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="flex  p-2  ">
        {categories.map((category) => (
          <div key={category.title} className="flex w-[50%] flex-col gap-0.5 ">
            <div className="text-sm text-muted-foreground mb-1.5">
              {category.title}
            </div>

            {category.metadata.map((connectorMetadata) => (
              <CardListItem
                className="rounded-sm py-3"
                key={connectorMetadata.displayName}
                onClick={() => setSelectedConnectorInExplore(connectorMetadata)}
              >
                <div className="flex gap-2 items-center h-full">
                  <ConnectorIcon
                    logoUrl={connectorMetadata.logoUrl}
                    displayName={connectorMetadata.displayName}
                    showTooltip={false}
                    size={'sm'}
                  />
                  <div className="grow h-full flex items-center justify-left text-sm">
                    {connectorMetadata.displayName}
                  </div>
                </div>{' '}
              </CardListItem>
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export { ExploreTabContent };
