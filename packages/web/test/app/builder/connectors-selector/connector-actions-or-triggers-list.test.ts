/**
 * @vitest-environment jsdom
 */
import {
  ConnectorType,
  PackageType,
  WorkflowActionType,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import {
  convertStepMetadataToConnectorSelectorItems,
  directPickItemOf,
} from '@/app/builder/connectors-selector/connector-actions-or-triggers-list';
import { getCoreActionsMetadata } from '@/features/connectors';

describe('convertStepMetadataToConnectorSelectorItems', () => {
  it.each([
    WorkflowActionType.CODE,
    WorkflowActionType.LOOP_ON_ITEMS,
    WorkflowActionType.ROUTER,
    WorkflowActionType.PARALLEL,
  ] as const)('lists exactly one item for the core %s step', (type) => {
    const metadata = getCoreActionsMetadata().filter(
      (step) => step.type === type,
    )[0];
    const items = convertStepMetadataToConnectorSelectorItems(metadata);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe(type);
  });
});

describe('directPickItemOf', () => {
  it.each([
    WorkflowActionType.LOOP_ON_ITEMS,
    WorkflowActionType.ROUTER,
  ] as const)('adds the %s step in one click', (type) => {
    const metadata = getCoreActionsMetadata().filter(
      (step) => step.type === type,
    )[0];
    expect(directPickItemOf(metadata)?.type).toBe(type);
  });

  it('still opens the action list for an app connector', () => {
    expect(
      directPickItemOf({
        type: WorkflowActionType.CONNECTOR,
        displayName: 'HTTP',
        logoUrl: '',
        description: '',
        connectorName: '@fema-ipaas/connector-http',
        connectorVersion: '0.0.1',
        connectorType: ConnectorType.OFFICIAL,
        categories: [],
        packageType: PackageType.REGISTRY,
        auth: undefined,
        suggestedActions: [],
      }),
    ).toBeNull();
  });
});
