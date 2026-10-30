// @vitest-environment jsdom
import { ConnectorType, PackageType, WorkflowActionType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { StepMetadataWithSuggestions } from '@/features/connectors/types';
import { connectorSearchUtils } from '@/features/connectors/utils/connector-search-utils';

function connector(connectorName: string): StepMetadataWithSuggestions {
  return {
    type: WorkflowActionType.CONNECTOR,
    connectorName,
    connectorVersion: '0.0.1',
    displayName: connectorName,
    logoUrl: '',
    description: '',
    categories: [],
    connectorType: ConnectorType.OFFICIAL,
    packageType: PackageType.REGISTRY,
    auth: undefined,
    suggestedActions: [],
    suggestedTriggers: [],
  };
}

const all = [
  connector('@fema-ipaas/connector-http'),
  connector('@fema-ipaas/connector-forms'),
  connector('@fema-ipaas/connector-webhook'),
];

function names(list: StepMetadataWithSuggestions[]): string[] {
  return list.flatMap((item) =>
    'connectorName' in item ? [item.connectorName] : [],
  );
}

describe('connectorSearchUtils.getHighlightedConnectors', () => {
  it('leaves out actions that only work with another trigger', () => {
    expect(
      names(
        connectorSearchUtils.getHighlightedConnectors({
          queryResult: all,
          type: 'action',
          triggerConnectorName: '@fema-ipaas/connector-beisen',
        }),
      ),
    ).toEqual(['@fema-ipaas/connector-http']);
  });

  it('keeps the form response action for a form triggered workflow', () => {
    expect(
      names(
        connectorSearchUtils.getHighlightedConnectors({
          queryResult: all,
          type: 'action',
          triggerConnectorName: '@fema-ipaas/connector-forms',
        }),
      ),
    ).toEqual(['@fema-ipaas/connector-http', '@fema-ipaas/connector-forms']);
  });
});
