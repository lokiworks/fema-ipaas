import {
  ConnectorCategory,
  WorkflowTriggerType,
  WorkflowActionType,
  AI_CONNECTOR_NAME,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import {
  CategorizedStepMetadataWithSuggestions,
  ConnectorStepMetadataWithSuggestions,
  StepMetadata,
  StepMetadataWithSuggestions,
} from '@/features/connectors/types';

const isWorkflowController = (stepMetadata: StepMetadata) => {
  if (
    stepMetadata.type === WorkflowActionType.CONNECTOR ||
    stepMetadata.type === WorkflowTriggerType.CONNECTOR
  ) {
    return stepMetadata.categories.includes(ConnectorCategory.WORKFLOW_CONTROL);
  }
  return (
    stepMetadata.type === WorkflowActionType.LOOP_ON_ITEMS ||
    stepMetadata.type === WorkflowActionType.ROUTER
  );
};

const getAiAndAgentsConnectors = (
  queryResult: StepMetadataWithSuggestions[],
) => {
  const res: CategorizedStepMetadataWithSuggestions[] = [];
  const connectors = filterResultByConnectorType(queryResult);
  const aiAndAgentsConnectors = connectors.filter(isAiAndAgentConnector);
  const recommendedCategory: CategorizedStepMetadataWithSuggestions = {
    title: t('Recommended'),
    metadata: [],
  };
  const othersCategory: CategorizedStepMetadataWithSuggestions = {
    title: t('Others'),
    metadata: [],
  };
  const recommendedConnectors = aiAndAgentsConnectors.filter((connector) =>
    connector.categories.includes(ConnectorCategory.UNIVERSAL_AI),
  );
  if (recommendedConnectors.length > 0) {
    recommendedCategory.metadata = recommendedConnectors;
    res.push(recommendedCategory);
  }
  const otherConnectors = aiAndAgentsConnectors.filter(
    (connector) => !recommendedConnectors.includes(connector),
  );
  if (otherConnectors.length > 0) {
    othersCategory.metadata = otherConnectors;
    res.push(othersCategory);
  }
  return res;
};

const isAiAndAgentConnector = (stepMetadata: StepMetadata) => {
  if (
    stepMetadata.type === WorkflowActionType.CONNECTOR ||
    stepMetadata.type === WorkflowTriggerType.CONNECTOR
  ) {
    return stepMetadata.categories.some((category) =>
      [
        ConnectorCategory.UNIVERSAL_AI,
        ConnectorCategory.ARTIFICIAL_INTELLIGENCE,
      ].includes(category as ConnectorCategory),
    );
  }
  return false;
};

const isUtilityConnector = (metadata: StepMetadata) =>
  metadata.type !== WorkflowTriggerType.CONNECTOR &&
  metadata.type !== WorkflowActionType.CONNECTOR
    ? !isWorkflowController(metadata)
    : metadata.categories.includes(ConnectorCategory.CORE) &&
      !isWorkflowController(metadata);

const isAppConnector = (metadata: StepMetadata) => {
  return (
    !isUtilityConnector(metadata) &&
    !isAiAndAgentConnector(metadata) &&
    !isWorkflowController(metadata)
  );
};

const getPinnedConnectors = (
  queryResult: StepMetadataWithSuggestions[],
  pinnedConnectorsNames: string[],
) => {
  const connectors = filterResultByConnectorType(queryResult);
  const pinnedConnectors = connectors.filter((connector) =>
    pinnedConnectorsNames.includes(connector.connectorName),
  );
  return sortByConnectorNameOrder(pinnedConnectors, pinnedConnectorsNames);
};

const POPULAR_CONNECTORS_NAMES = [
  '@fema-ipaas/connector-google-sheets',
  '@fema-ipaas/connector-slack',
  '@fema-ipaas/connector-notion',
  '@fema-ipaas/connector-gmail',
  '@fema-ipaas/connector-hubspot',
  '@fema-ipaas/connector-openai',
  '@fema-ipaas/connector-google-forms',
  '@fema-ipaas/connector-google-drive',
  '@fema-ipaas/connector-google-docs',
];
const getPopularConnectors = (
  queryResult: StepMetadataWithSuggestions[],
  pinnedConnectorsNames: string[],
) => {
  const connectors = filterResultByConnectorType(queryResult);
  const popularConnectors = connectors.filter(
    (connector) =>
      POPULAR_CONNECTORS_NAMES.includes(connector.connectorName) &&
      !pinnedConnectorsNames.includes(connector.connectorName),
  );
  return sortByConnectorNameOrder(popularConnectors, POPULAR_CONNECTORS_NAMES);
};

const filterResultByConnectorType = (
  queryResult: StepMetadataWithSuggestions[],
) => {
  return queryResult.filter(
    (connector): connector is ConnectorStepMetadataWithSuggestions =>
      connector.type === WorkflowActionType.CONNECTOR ||
      connector.type === WorkflowTriggerType.CONNECTOR,
  );
};

const getHighlightedConnectors = (
  queryResult: StepMetadataWithSuggestions[],
  type: 'action' | 'trigger',
) => {
  const connectors = filterResultByConnectorType(queryResult);
  const highlightedConnectorsNames =
    type === 'action'
      ? HIGHLIGHTED_CONNECTORS_NAMES_FOR_ACTIONS
      : HIGHLIGHTED_CONNECTORS_NAMES_FOR_TRIGGERS;
  const highlightedConnectors = connectors.filter((connector) =>
    highlightedConnectorsNames.includes(connector.connectorName),
  );
  return sortByConnectorNameOrder(
    highlightedConnectors,
    type === 'action'
      ? HIGHLIGHTED_CONNECTORS_NAMES_FOR_ACTIONS
      : HIGHLIGHTED_CONNECTORS_NAMES_FOR_TRIGGERS,
  );
};
const sortByConnectorNameOrder = (
  searchResult: StepMetadataWithSuggestions[],
  orderNames: string[],
): StepMetadataWithSuggestions[] => {
  const connectors = filterResultByConnectorType(searchResult);
  return connectors.sort((a, b) => {
    return (
      orderNames.indexOf(a.connectorName) - orderNames.indexOf(b.connectorName)
    );
  });
};
const HIGHLIGHTED_CONNECTORS_NAMES_FOR_TRIGGERS = [
  '@fema-ipaas/connector-webhook',
  '@fema-ipaas/connector-schedule',
  '@fema-ipaas/connector-manual-trigger',
  '@fema-ipaas/connector-forms',
  '@fema-ipaas/connector-tables',
];

const HIGHLIGHTED_CONNECTORS_NAMES_FOR_ACTIONS = [
  AI_CONNECTOR_NAME,
  '@fema-ipaas/connector-http',
  '@fema-ipaas/connector-tables',
  '@fema-ipaas/connector-forms',
  '@fema-ipaas/connector-webhook',
  '@fema-ipaas/connector-text-helper',
  '@fema-ipaas/connector-date-helper',
];

export const connectorSearchUtils = {
  isWorkflowController,
  getAiAndAgentsConnectors,
  isAiAndAgentConnector,
  isUtilityConnector,
  isAppConnector,
  getPinnedConnectors,
  getPopularConnectors,
  getHighlightedConnectors,
};
