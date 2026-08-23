import { WorkflowOperationType, WorkflowTriggerType } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  CheckCircle2Icon,
  LayoutGridIcon,
  PuzzleIcon,
  SparklesIcon,
  WrenchIcon,
} from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { useDebounce } from 'use-debounce';

import { useBuilderStateContext } from '@/app/builder/builder-hooks';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  ConnectorsSearchInput,
  ConnectorSelectorTabs,
  ConnectorSelectorTabsProvider,
  ConnectorSelectorTabType,
  ConnectorSelectorOperation,
  connectorSelectorUtils,
  connectorSelectorCustomization,
  ConnectorSearchProvider,
  useConnectorSearchContext,
  connectorsHooks,
} from '@/features/connectors';
import { tenantHooks } from '@/hooks/tenant-hooks';
import { useIsMobile } from '@/hooks/use-mobile';
import { authenticationSession } from '@/lib/authentication-session';

import { ApprovalsTabContent } from './approvals-tab-content';
import { ConnectorsCardList } from './connectors-card-list';
import { ExploreTabContent } from './explore-tab-content';

const getTabsList = (
  operationType: WorkflowOperationType,
  aiAndAgentsAvailable: boolean,
) => {
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

  const replaceOrAddAction = [
    WorkflowOperationType.ADD_ACTION,
    WorkflowOperationType.UPDATE_ACTION,
  ].includes(operationType);

  if (replaceOrAddAction && aiAndAgentsAvailable) {
    baseTabs.splice(1, 0, {
      value: ConnectorSelectorTabType.AI_AND_AGENTS,
      name: t('AI & Agents'),
      icon: <SparklesIcon className="size-5" />,
    });
  }
  if (replaceOrAddAction) {
    baseTabs.push({
      value: ConnectorSelectorTabType.APPROVALS,
      name: t('Approvals'),
      icon: <CheckCircle2Icon className="size-5" />,
    });
  }
  return baseTabs;
};

type ConnectorSelectorProps = {
  children: React.ReactNode;
  id: string;
  operation: ConnectorSelectorOperation;
  openSelectorOnClick?: boolean;
  stepToReplaceConnectorDisplayName?: string;
};

const ConnectorSelectorWrapper = (props: ConnectorSelectorProps) => {
  return (
    <ConnectorSearchProvider>
      <ConnectorSelectorContent {...props} />
    </ConnectorSearchProvider>
  );
};

const ConnectorSelectorContent = ({
  children,
  operation,
  id,
  openSelectorOnClick = true,
  stepToReplaceConnectorDisplayName,
}: ConnectorSelectorProps) => {
  const [
    openedConnectorSelectorStepNameOrAddButtonId,
    setOpenedConnectorSelectorStepNameOrAddButtonId,
    setSelectedConnectorMetadataInConnectorSelector,
    isForEmptyTrigger,
    deselectStep,
  ] = useBuilderStateContext((state) => [
    state.openedConnectorSelectorStepNameOrAddButtonId,
    state.setOpenedConnectorSelectorStepNameOrAddButtonId,
    state.setSelectedConnectorMetadataInConnectorSelector,
    state.workflowVersion.trigger.type === WorkflowTriggerType.EMPTY &&
      id === 'trigger',
    state.deselectStep,
  ]);
  const { searchQuery, setSearchQuery } = useConnectorSearchContext();
  const isForReplace =
    operation.type === WorkflowOperationType.UPDATE_ACTION ||
    (operation.type === WorkflowOperationType.UPDATE_TRIGGER &&
      !isForEmptyTrigger);
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const isOpen = openedConnectorSelectorStepNameOrAddButtonId === id;
  const isMobile = useIsMobile();
  const { listHeightRef, popoverTriggerRef } =
    connectorSelectorUtils.useAdjustConnectorListHeightToAvailableSpace();
  const listHeight =
    Math.min(listHeightRef.current, 300) -
    connectorSelectorUtils.CONNECTOR_SELECTOR_CLIPPING_THRESHOLD;
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen]);
  const aiProviders: unknown[] = [];
  const {
    connectorModel: aiConnectorModel,
    isError: isAiConnectorError,
    isSuccess: isAiConnectorLoaded,
  } = connectorsHooks.useConnector({
    name: '@fema-ipaas/connector-ai',
    workspaceId: authenticationSession.getWorkspaceId() ?? undefined,
  });
  const isAiConnectorUnavailable =
    isAiConnectorError ||
    (isAiConnectorLoaded &&
      Object.keys(aiConnectorModel?.actions ?? {}).length === 0);
  const clearSearch = () => {
    setSearchQuery('');
    setSelectedConnectorMetadataInConnectorSelector(null);
  };

  const { tenant } = tenantHooks.useCurrentTenant();
  const tabsList = connectorSelectorCustomization.buildResolvedTabs({
    availableBuiltinTabs: getTabsList(
      operation.type,
      aiProviders.length > 0 && !isAiConnectorUnavailable,
    ),
    config: tenant.connectorSelectorConfig,
  });
  const firstTab = tabsList[0];

  return (
    <Popover
      open={isOpen}
      modal={false}
      onOpenChange={(open) => {
        if (open) {
          if (isForEmptyTrigger || openSelectorOnClick) {
            setOpenedConnectorSelectorStepNameOrAddButtonId(id);
          }
          return;
        }
        clearSearch();
        setOpenedConnectorSelectorStepNameOrAddButtonId(null);
        if (isForEmptyTrigger) {
          deselectStep();
        }
      }}
    >
      <PopoverTrigger
        ref={popoverTriggerRef}
        asChild={true}
        onClick={() => {
          if (openSelectorOnClick) {
            setOpenedConnectorSelectorStepNameOrAddButtonId(id);
          }
        }}
      >
        {children}
      </PopoverTrigger>

      <ConnectorSelectorTabsProvider
        initiallySelectedTab={
          isForReplace || isMobile
            ? ConnectorSelectorTabType.NONE
            : firstTab?.type ?? ConnectorSelectorTabType.EXPLORE
        }
        initiallySelectedCustomTabId={
          isForReplace || isMobile ? null : firstTab?.customTabId ?? null
        }
        onTabChange={clearSearch}
        key={isOpen ? 'open' : 'closed'}
      >
        <PopoverContent
          onContextMenu={(e) => {
            e.stopPropagation();
          }}
          onInteractOutside={(e) => {
            if (e.detail.originalEvent.type === 'focusin') {
              e.preventDefault();
            }
          }}
          className="w-[340px] md:w-[600px] p-0 shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <>
            <div>
              <ConnectorsSearchInput
                searchInputRef={searchInputRef}
                onSearchChange={(e) => {
                  setSelectedConnectorMetadataInConnectorSelector(null);
                  if (e === '') {
                    clearSearch();
                  }
                }}
              />
              {!isMobile && <ConnectorSelectorTabs tabs={tabsList} />}
              <Separator orientation="horizontal" className="mt-1" />
            </div>
            <div
              className=" flex flex-row max-h-[300px]"
              style={{
                height: listHeight + 'px',
              }}
            >
              <ExploreTabContent operation={operation} />
              <ApprovalsTabContent operation={operation} />

              <ConnectorsCardList
                //this is done to avoid debounced results when user clears search
                searchQuery={searchQuery === '' ? '' : debouncedQuery}
                operation={operation}
                stepToReplaceConnectorDisplayName={
                  isMobile ? undefined : stepToReplaceConnectorDisplayName
                }
              />
            </div>
          </>
        </PopoverContent>
      </ConnectorSelectorTabsProvider>
    </Popover>
  );
};

export { ConnectorSelectorWrapper as ConnectorSelector };
