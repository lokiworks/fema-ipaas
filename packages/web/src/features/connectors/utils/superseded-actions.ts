import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk';

function withoutSupersededActions<
  T extends Pick<ConnectorMetadataModelSummary, 'name' | 'suggestedActions'>,
>(connector: T): T {
  const superseded = SUPERSEDED_ACTIONS[connector.name];
  if (!superseded || !connector.suggestedActions) {
    return connector;
  }
  return {
    ...connector,
    suggestedActions: connector.suggestedActions.filter(
      (action) => !superseded.includes(action.name),
    ),
  };
}

export const supersededActions = {
  withoutSupersededActions,
};

const SUPERSEDED_ACTIONS: Record<string, string[]> = {
  '@fema-ipaas/connector-webhook': ['return_response'],
  '@fema-ipaas/connector-data-mapper': ['advanced_mapping'],
};
