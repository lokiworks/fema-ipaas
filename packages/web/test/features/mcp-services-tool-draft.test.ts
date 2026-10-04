import { McpToolSourceType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { mcpServiceUiUtils } from '@/features/mcp-services/utils/mcp-service-ui-utils';

describe('mcpServiceUiUtils.buildToolDraft', () => {
  const source = {
    type: McpToolSourceType.CONNECTOR_ACTION as const,
    connectorName: '@fema-ipaas/connector-text-helper',
    actionName: 'concat',
  };

  it('names a tool after the action when the display name has no latin letters', () => {
    const draft = mcpServiceUiUtils.buildToolDraft({
      source,
      sourceParams: [],
      titleHint: '拼接',
      taken: [],
    });

    expect(draft.name).toBe('concat');
    expect(draft.title).toBe('拼接');
  });

  it('keeps naming after the display name when it has latin letters', () => {
    const draft = mcpServiceUiUtils.buildToolDraft({
      source,
      sourceParams: [],
      titleHint: 'Join text',
      taken: [],
    });

    expect(draft.name).toBe('join_text');
  });
});
