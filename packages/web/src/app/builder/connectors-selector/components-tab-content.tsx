import {
  FlowComponentCategory,
  FlowComponentMetadata,
} from '@fema-ipaas/component-sdk';
import { WorkflowActionType, WorkflowOperationType } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { CardList, CardListItemSkeleton } from '@/components/custom/card-list';
import { componentLogoUrl, componentsHooks } from '@/features/components';
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

const CATEGORY_TITLES: Record<FlowComponentCategory, string> = {
  [FlowComponentCategory.CONTROL]: t('Control'),
  [FlowComponentCategory.DATA]: t('Data'),
  [FlowComponentCategory.RUNTIME]: t('Runtime'),
  [FlowComponentCategory.HUMAN]: t('Human'),
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

  if (
    selectedTab !== ConnectorSelectorTabType.COMPONENTS ||
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
    matchesSearch(component, searchQuery),
  );

  if (matching.length === 0) {
    return <NoResultsFound />;
  }

  return (
    <CardList listClassName="gap-0 w-full">
      {CATEGORY_ORDER.filter((category) =>
        matching.some((component) => component.category === category),
      ).map((category) => (
        <div key={category}>
          <div className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">
            {CATEGORY_TITLES[category]}
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
      ))}
    </CardList>
  );
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

function matchesSearch(
  component: FlowComponentMetadata,
  searchQuery: string,
): boolean {
  if (searchQuery.trim() === '') {
    return true;
  }
  const needle = searchQuery.trim().toLowerCase();
  return (
    component.displayName.toLowerCase().includes(needle) ||
    component.description.toLowerCase().includes(needle)
  );
}

export { ComponentsTabContent };
