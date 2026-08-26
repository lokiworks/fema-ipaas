import { WorkflowOperationType, WorkflowTriggerType } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  BlocksIcon,
  ChevronLeftIcon,
  LayoutGridIcon,
  PuzzleIcon,
  WrenchIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useDebounce } from 'use-debounce';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import { ComponentsTabContent } from '@/app/builder/connectors-selector/components-tab-content';
import { ConnectorsCardList } from '@/app/builder/connectors-selector/connectors-card-list';
import { ExploreTabContent } from '@/app/builder/connectors-selector/explore-tab-content';
import { SidebarHeader } from '@/app/builder/sidebar-header';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ConnectorsSearchInput,
  ConnectorSearchProvider,
  ConnectorSelectorOperation,
  ConnectorSelectorTabs,
  ConnectorSelectorTabsProvider,
  ConnectorSelectorTabType,
  connectorSelectorCustomization,
  useConnectorSearchContext,
} from '@/features/connectors';
import { tenantHooks } from '@/hooks/tenant-hooks';

export const ConnectorPickerPanel = () => {
  const [operation, openedId] = useBuilderStateContext((state) => [
    state.connectorSelectorOperation,
    state.openedConnectorSelectorStepNameOrAddButtonId,
  ]);
  if (!operation) {
    return null;
  }
  return (
    <ConnectorSearchProvider key={openedId ?? 'closed'}>
      <ConnectorPickerPanelContent operation={operation} />
    </ConnectorSearchProvider>
  );
};

const ConnectorPickerPanelContent = ({
  operation,
}: {
  operation: ConnectorSelectorOperation;
}) => {
  const [
    isForEmptyTrigger,
    selectedConnectorMetadata,
    setSelectedConnectorMetadata,
    closePicker,
    deselectStep,
    replacedStepDisplayName,
  ] = useBuilderStateContext((state) => [
    state.workflowVersion.trigger.type === WorkflowTriggerType.EMPTY,
    state.selectedConnectorMetadataInConnectorSelector,
    state.setSelectedConnectorMetadataInConnectorSelector,
    state.setOpenedConnectorSelectorStepNameOrAddButtonId,
    state.deselectStep,
    state.connectorSelectorReplacedStepDisplayName,
  ]);
  const { searchQuery, setSearchQuery } = useConnectorSearchContext();
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { tenant } = tenantHooks.useCurrentTenant();

  useEffect(() => {
    const focusTimeout = setTimeout(() => searchInputRef.current?.focus());
    return () => clearTimeout(focusTimeout);
  }, []);

  const clearSearch = () => {
    setSearchQuery('');
    setSelectedConnectorMetadata(null);
  };

  const handleClose = () => {
    closePicker(null);
    if (isForEmptyTrigger) {
      deselectStep();
    }
  };

  const tabsList = connectorSelectorCustomization.buildResolvedTabs({
    availableBuiltinTabs: buildTabsList(operation.type),
    config: tenant.connectorSelectorConfig,
  });
  const firstTab = tabsList[0];

  return (
    <ConnectorSelectorTabsProvider
      initiallySelectedTab={firstTab?.type ?? ConnectorSelectorTabType.EXPLORE}
      initiallySelectedCustomTabId={firstTab?.customTabId ?? null}
      onTabChange={clearSearch}
    >
      <div className="flex h-full w-full flex-col">
        <SidebarHeader onClose={handleClose}>
          {selectedConnectorMetadata ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 px-1 text-base font-semibold"
              onClick={() => setSelectedConnectorMetadata(null)}
            >
              <ChevronLeftIcon size={16} />
              {selectedConnectorMetadata.displayName}
            </Button>
          ) : (
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-semibold">
                {panelTitle(operation.type)}
              </span>
              {replacedStepDisplayName && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {t('Replacing {name}', { name: replacedStepDisplayName })}
                </span>
              )}
            </div>
          )}
        </SidebarHeader>
        <Separator orientation="horizontal" />
        <div className="shrink-0">
          <ConnectorsSearchInput
            searchInputRef={searchInputRef}
            onSearchChange={(value) => {
              setSelectedConnectorMetadata(null);
              if (value === '') {
                clearSearch();
              }
            }}
          />
          <ConnectorSelectorTabs tabs={tabsList} />
          <Separator orientation="horizontal" />
        </div>
        <div className="flex min-h-0 grow flex-row overflow-hidden">
          <ExploreTabContent operation={operation} />
          <ComponentsTabContent
            operation={operation}
            searchQuery={searchQuery === '' ? '' : debouncedQuery}
          />
          <ConnectorsCardList
            searchQuery={searchQuery === '' ? '' : debouncedQuery}
            operation={operation}
          />
        </div>
      </div>
    </ConnectorSelectorTabsProvider>
  );
};

function panelTitle(operationType: WorkflowOperationType) {
  return operationType === WorkflowOperationType.UPDATE_TRIGGER
    ? t('Select Trigger')
    : t('Select Action');
}

function buildTabsList(operationType: WorkflowOperationType) {
  const baseTabs = [
    {
      value: ConnectorSelectorTabType.EXPLORE,
      name: t('Explore'),
      icon: <LayoutGridIcon className="size-5" />,
    },
    {
      value: ConnectorSelectorTabType.APPS,
      name: t('Apps'),
      icon: <PuzzleIcon className="size-5" />,
    },
    {
      value: ConnectorSelectorTabType.UTILITY,
      name: t('Utility'),
      icon: <WrenchIcon className="size-5" />,
    },
  ];

  const isActionOperation = [
    WorkflowOperationType.ADD_ACTION,
    WorkflowOperationType.UPDATE_ACTION,
  ].includes(operationType);

  if (!isActionOperation) {
    return baseTabs;
  }

  return [
    baseTabs[0],
    {
      value: ConnectorSelectorTabType.COMPONENTS,
      name: t('Core Components'),
      icon: <BlocksIcon className="size-5" />,
    },
    ...baseTabs.slice(1),
  ];
}
