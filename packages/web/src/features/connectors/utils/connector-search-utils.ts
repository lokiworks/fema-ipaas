import {
  ConnectorCategory,
  FlowTriggerType,
  FlowActionType,
  AI_CONNECTOR_NAME,
} from '@fema/shared';
import { t } from 'i18next';

import {
  CategorizedStepMetadataWithSuggestions,
  ConnectorStepMetadataWithSuggestions,
  StepMetadata,
  StepMetadataWithSuggestions,
} from '@/features/connectors/types';

const isFlowController = (stepMetadata: StepMetadata) => {
  if (
    stepMetadata.type === FlowActionType.CONNECTOR ||
    stepMetadata.type === FlowTriggerType.CONNECTOR
  ) {
    return stepMetadata.categories.includes(ConnectorCategory.FLOW_CONTROL);
  }
  return (
    stepMetadata.type === FlowActionType.LOOP_ON_ITEMS ||
    stepMetadata.type === FlowActionType.ROUTER
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
    stepMetadata.type === FlowActionType.CONNECTOR ||
    stepMetadata.type === FlowTriggerType.CONNECTOR
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
  metadata.type !== FlowTriggerType.CONNECTOR &&
  metadata.type !== FlowActionType.CONNECTOR
    ? !isFlowController(metadata)
    : metadata.categories.includes(ConnectorCategory.CORE) &&
      !isFlowController(metadata);

const isAppConnector = (metadata: StepMetadata) => {
  return (
    !isUtilityConnector(metadata) &&
    !isAiAndAgentConnector(metadata) &&
    !isFlowController(metadata)
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
  '@fema/connector-google-sheets',
  '@fema/connector-slack',
  '@fema/connector-notion',
  '@fema/connector-gmail',
  '@fema/connector-hubspot',
  '@fema/connector-openai',
  '@fema/connector-google-forms',
  '@fema/connector-google-drive',
  '@fema/connector-google-docs',
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
      connector.type === FlowActionType.CONNECTOR ||
      connector.type === FlowTriggerType.CONNECTOR,
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
  '@fema/connector-webhook',
  '@fema/connector-schedule',
  '@fema/connector-manual-trigger',
  '@fema/connector-forms',
  '@fema/connector-tables',
];

const HIGHLIGHTED_CONNECTORS_NAMES_FOR_ACTIONS = [
  AI_CONNECTOR_NAME,
  '@fema/connector-http',
  '@fema/connector-tables',
  '@fema/connector-forms',
  '@fema/connector-webhook',
  '@fema/connector-text-helper',
  '@fema/connector-date-helper',
];

export const connectorSearchUtils = {
  isFlowController,
  getAiAndAgentsConnectors,
  isAiAndAgentConnector,
  isUtilityConnector,
  isAppConnector,
  getPinnedConnectors,
  getPopularConnectors,
  getHighlightedConnectors,
};
