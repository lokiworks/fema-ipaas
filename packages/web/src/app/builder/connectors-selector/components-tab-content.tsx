import {
  FlowComponentCategory,
  FlowComponentMetadata,
} from '@fema-ipaas/component-sdk';
import { WorkflowActionType, WorkflowOperationType } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { CardList, CardListItemSkeleton } from '@/components/custom/card-list';
import {
  componentLogoUrl,
  componentsHooks,
  componentSearchUtils,
} from '@/features/components';
import {
  ConnectorSelectorTabType,
  useConnectorSelectorTabs,
  ConnectorSelectorOperation,
} from '@/features/connectors';
import { ComponentStepMetadata } from '@/features/connectors/types';

import { useBuilderStateContext } from '../builder-hooks';

import GenericActionOrTriggerItem from './generic-connector-selector-item';
import { NoResultsFound } from './no-results-found';

const CATEGORY_ORDER: FlowComponentCategory[] = [
  FlowComponentCategory.CONTROL,
  FlowComponentCategory.DATA,
  FlowComponentCategory.RUNTIME,
  FlowComponentCategory.HUMAN,
];

const CATEGORY_TITLES: Record<FlowComponentCategory, () => string> = {
  [FlowComponentCategory.CONTROL]: () => t('component: Control'),
  [FlowComponentCategory.DATA]: () => t('component: Data'),
  [FlowComponentCategory.RUNTIME]: () => t('component: Runtime'),
  [FlowComponentCategory.HUMAN]: () => t('component: Human'),
};

const ComponentsTabContent = ({
  operation,
  searchQuery,
}: {
  operation: ConnectorSelectorOperation;
  searchQuery: string;
}) => {
  const { selectedTab } = useConnectorSelectorTabs();
  const [handleAddingOrUpdatingStep] = useBuilderStateContext((state) => [
    state.handleAddingOrUpdatingStep,
  ]);
  const { data: components, isLoading } = componentsHooks.useComponents();

  const isSearching =
    selectedTab === ConnectorSelectorTabType.NONE && searchQuery.trim() !== '';
  if (
    (selectedTab !== ConnectorSelectorTabType.COMPONENTS && !isSearching) ||
    ![
      WorkflowOperationType.ADD_ACTION,
      WorkflowOperationType.UPDATE_ACTION,
    ].includes(operation.type)
  ) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 w-full p-2">
        <CardListItemSkeleton numberOfCards={4} withCircle={false} />
      </div>
    );
  }

  const matching = (components ?? []).filter((component) =>
    componentSearchUtils.matches({ component, searchQuery }),
  );

  if (matching.length === 0) {
    return isSearching ? null : <NoResultsFound />;
  }

  const categoryList = CATEGORY_ORDER.filter((category) =>
    matching.some((component) => component.category === category),
  ).map((category) => (
    <div key={category}>
      <div className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">
        {CATEGORY_TITLES[category]()}
      </div>
      {matching
        .filter((component) => component.category === category)
        .map((component) => {
          const metadata = toStepMetadata(component);
          return (
            <GenericActionOrTriggerItem
              key={component.type}
              item={metadata}
              hideConnectorIconAndDescription={false}
              stepMetadataWithSuggestions={metadata}
              onClick={() => {
                handleAddingOrUpdatingStep({
                  connectorSelectorItem: metadata,
                  operation,
                  selectStepAfter: true,
                });
              }}
            />
          );
        })}
    </div>
  ));

  if (isSearching) {
    return (
      <div className="max-h-[45%] shrink-0 overflow-y-auto pb-2">
        {categoryList}
      </div>
    );
  }

  return <CardList listClassName="gap-0 w-full">{categoryList}</CardList>;
};

function toStepMetadata(
  component: FlowComponentMetadata,
): ComponentStepMetadata {
  return {
    type: WorkflowActionType.COMPONENT,
    componentType: component.type,
    category: component.category,
    props: component.props,
    icon: component.icon,
    displayName: component.displayName,
    description: component.description,
    logoUrl: componentLogoUrl(component.icon),
  };
}

export { ComponentsTabContent };
