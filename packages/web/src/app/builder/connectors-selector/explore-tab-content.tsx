import { WorkflowOperationType } from '@fema-ipaas/shared';

import { CardListItemSkeleton } from '@/components/custom/card-list';
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
      <div className="flex flex-col gap-3 p-2">
        {categories.map((category) => (
          <div key={category.title} className="flex flex-col gap-1">
            <div className="px-1 text-xs text-muted-foreground">
              {category.title}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {category.metadata.map((connectorMetadata) => (
                <button
                  type="button"
                  key={connectorMetadata.displayName}
                  title={connectorMetadata.displayName}
                  onClick={() =>
                    setSelectedConnectorInExplore(connectorMetadata)
                  }
                  className="flex flex-col items-center justify-start gap-1.5 rounded-md px-1 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ConnectorIcon
                    logoUrl={connectorMetadata.logoUrl}
                    displayName={connectorMetadata.displayName}
                    showTooltip={false}
                    size={'md'}
                  />
                  <span className="line-clamp-2 w-full text-center text-[11px] leading-tight text-muted-foreground">
                    {connectorMetadata.displayName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export { ExploreTabContent };
