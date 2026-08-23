import { isNil } from '@fema-ipaas/core-utils';
import { WorkflowActionType, WorkflowOperationType } from '@fema-ipaas/shared';

import { CardList, CardListItemSkeleton } from '@/components/custom/card-list';
import {
  connectorsHooks,
  ConnectorSelectorTabType,
  useConnectorSelectorTabs,
  ConnectorSelectorOperation,
  stepUtils,
} from '@/features/connectors';

import { useBuilderStateContext } from '../builder-hooks';

import GenericActionOrTriggerItem from './generic-connector-selector-item';

const APPROVAL_CONNECTORS_CONFIG = [
  {
    connectorName: '@fema-ipaas/connector-slack',
    approvalActionNames: [
      'request_approval_message',
      'request_approval_direct_message',
    ],
  },
  {
    connectorName: '@fema-ipaas/connector-discord',
    approvalActionNames: ['request_approval_message'],
  },
  {
    connectorName: '@fema-ipaas/connector-microsoft-teams',
    approvalActionNames: [
      'request_approval_direct_message',
      'request_approval_in_channel',
    ],
  },
  {
    connectorName: '@fema-ipaas/connector-microsoft-outlook',
    approvalActionNames: ['request_approval_in_mail'],
  },
  {
    connectorName: '@fema-ipaas/connector-gmail',
    approvalActionNames: ['request_approval_in_mail'],
  },
  {
    connectorName: '@fema-ipaas/connector-telegram-bot',
    approvalActionNames: ['request_approval_message'],
  },
];

const ApprovalsTabContent = ({
  operation,
}: {
  operation: ConnectorSelectorOperation;
}) => {
  const { selectedTab } = useConnectorSelectorTabs();
  const [handleAddingOrUpdatingStep] = useBuilderStateContext((state) => [
    state.handleAddingOrUpdatingStep,
  ]);

  const connectorQueries = connectorsHooks.useMultipleConnectors({
    names: APPROVAL_CONNECTORS_CONFIG.map((config) => config.connectorName),
  });

  const isLoading = connectorQueries.some((query) => query.isLoading);
  const allConnectorsLoaded = connectorQueries.every(
    (query) => query.isSuccess && !isNil(query.data),
  );

  if (
    selectedTab !== ConnectorSelectorTabType.APPROVALS ||
    ![
      WorkflowOperationType.ADD_ACTION,
      WorkflowOperationType.UPDATE_ACTION,
    ].includes(operation.type)
  ) {
    return null;
  }

  if (isLoading || !allConnectorsLoaded) {
    return (
      <div className="flex flex-col gap-2 w-full p-2">
        <CardListItemSkeleton numberOfCards={3} withCircle={false} />
      </div>
    );
  }

  const allApprovalActions = connectorQueries.flatMap((query) => {
    if (!query.data) return [];

    const config = APPROVAL_CONNECTORS_CONFIG.find(
      (config) => config.connectorName === query.data.name,
    );
    if (isNil(config)) return [];
    const connectorMetadata = stepUtils.mapConnectorToMetadata({
      connector: query.data,
      type: 'action',
    });

    return config.approvalActionNames
      .map((actionName) => {
        const action = query.data.actions[actionName];
        if (!action) return null;
        return {
          action,
          connectorMetadata,
        };
      })
      .filter((item) => !isNil(item));
  });

  return (
    <CardList listClassName="gap-0">
      {allApprovalActions.map((item) => (
        <GenericActionOrTriggerItem
          key={`${item.connectorMetadata.connectorName}-${item.action.name}`}
          item={{
            actionOrTrigger: item.action,
            type: WorkflowActionType.CONNECTOR,
            connectorMetadata: item.connectorMetadata,
          }}
          hideConnectorIconAndDescription={false}
          stepMetadataWithSuggestions={{
            ...item.connectorMetadata,
            suggestedActions: [item.action],
            suggestedTriggers: [],
          }}
          onClick={() => {
            handleAddingOrUpdatingStep({
              connectorSelectorItem: {
                actionOrTrigger: item.action,
                type: WorkflowActionType.CONNECTOR,
                connectorMetadata: item.connectorMetadata,
              },
              operation,
              selectStepAfter: true,
            });
          }}
        />
      ))}
    </CardList>
  );
};

export { ApprovalsTabContent };
