/**
 * @vitest-environment jsdom
 */
import { WorkflowActionType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { convertStepMetadataToConnectorSelectorItems } from '@/app/builder/connectors-selector/connector-actions-or-triggers-list';
import {
  getCoreActionsMetadata,
  StepMetadataWithSuggestions,
} from '@/features/connectors';

describe('convertStepMetadataToConnectorSelectorItems', () => {
  it.each([
    WorkflowActionType.CODE,
    WorkflowActionType.LOOP_ON_ITEMS,
    WorkflowActionType.ROUTER,
    WorkflowActionType.PARALLEL,
  ] as const)('lists exactly one item for the core %s step', (type) => {
    const metadata: StepMetadataWithSuggestions = {
      ...getCoreActionsMetadata().filter((step) => step.type === type)[0],
      suggestedActions: [],
      suggestedTriggers: [],
    };
    const items = convertStepMetadataToConnectorSelectorItems(metadata);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe(type);
  });
});
