import {
  McpToolParamMode,
  McpToolSourceType,
  McpToolTriggerKind,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { mcpServiceUiUtils } from '@/features/mcp-services/utils/mcp-service-ui-utils';

describe('mcpServiceUiUtils.toolNameFor', () => {
  it('turns a display name into a unique snake_case tool name', () => {
    expect(
      mcpServiceUiUtils.toolNameFor({
        displayName: 'Create Feishu Account',
        taken: [],
      }),
    ).toBe('create_feishu_account');
  });

  it('adds a numeric suffix when the name is taken', () => {
    expect(
      mcpServiceUiUtils.toolNameFor({
        displayName: 'sync',
        taken: ['sync'],
      }),
    ).toBe('sync_2');
  });
});

describe('mcpServiceUiUtils.toolErrors', () => {
  const baseTool = {
    name: 'lookup_employee',
    title: 'Lookup employee',
    description: 'Looks up an employee by work id',
    params: [],
  };

  it('accepts a fully filled in tool with no params', () => {
    const errors = mcpServiceUiUtils.toolErrors({
      tool: baseTool,
      siblingNames: [],
    });
    expect(mcpServiceUiUtils.hasToolErrors(errors)).toBe(false);
  });

  it('flags a missing name, title and description', () => {
    const errors = mcpServiceUiUtils.toolErrors({
      tool: { ...baseTool, name: '', title: '', description: '' },
      siblingNames: [],
    });
    expect(errors.name).toBe('required');
    expect(errors.title).toBe('required');
    expect(errors.description).toBe('required');
  });

  it('flags a name that does not match the strict snake_case pattern', () => {
    const errors = mcpServiceUiUtils.toolErrors({
      tool: { ...baseTool, name: 'Lookup-Employee' },
      siblingNames: [],
    });
    expect(errors.name).toBe('mcpToolNameInvalidPattern');
  });

  it('flags a name already used by a sibling tool', () => {
    const errors = mcpServiceUiUtils.toolErrors({
      tool: baseTool,
      siblingNames: ['lookup_employee'],
    });
    expect(errors.name).toBe('mcpToolNameDuplicateInService');
  });

  it('requires a fixed value when the mode is FIXED', () => {
    const errors = mcpServiceUiUtils.toolErrors({
      tool: {
        ...baseTool,
        params: [
          {
            name: 'workId',
            description: '',
            mode: McpToolParamMode.FIXED,
            required: false,
            valueType: 'string',
          },
        ],
      },
      siblingNames: [],
    });
    expect(errors.params?.workId).toBe('mcpToolParamFixedValueRequired');
  });

  it('requires at least one reference in a REFERENCE param', () => {
    const errors = mcpServiceUiUtils.toolErrors({
      tool: {
        ...baseTool,
        params: [
          {
            name: 'summary',
            description: '',
            mode: McpToolParamMode.REFERENCE,
            value: 'no braces here',
            required: false,
            valueType: 'string',
          },
        ],
      },
      siblingNames: [],
    });
    expect(errors.params?.summary).toBe('mcpToolParamReferenceNeedsTarget');
  });

  it('rejects a param referencing itself', () => {
    const errors = mcpServiceUiUtils.toolErrors({
      tool: {
        ...baseTool,
        params: [
          {
            name: 'summary',
            description: '',
            mode: McpToolParamMode.REFERENCE,
            value: '{{summary}}',
            required: false,
            valueType: 'string',
          },
        ],
      },
      siblingNames: [],
    });
    expect(errors.params?.summary).toBe('mcpToolParamReferenceSelf');
  });

  it('rejects a reference to a param that does not exist', () => {
    const errors = mcpServiceUiUtils.toolErrors({
      tool: {
        ...baseTool,
        params: [
          {
            name: 'summary',
            description: '',
            mode: McpToolParamMode.REFERENCE,
            value: '{{missing}}',
            required: false,
            valueType: 'string',
          },
        ],
      },
      siblingNames: [],
    });
    expect(errors.params?.summary).toBe('mcpToolParamReferenceMissingTarget');
  });

  it('rejects a reference chained to another reference param', () => {
    const errors = mcpServiceUiUtils.toolErrors({
      tool: {
        ...baseTool,
        params: [
          {
            name: 'summary',
            description: '',
            mode: McpToolParamMode.REFERENCE,
            value: '{{title}}',
            required: false,
            valueType: 'string',
          },
          {
            name: 'title',
            description: '',
            mode: McpToolParamMode.REFERENCE,
            value: '{{summary}}',
            required: false,
            valueType: 'string',
          },
        ],
      },
      siblingNames: [],
    });
    expect(errors.params?.summary).toBe('mcpToolParamReferenceChained');
  });
});

describe('mcpServiceUiUtils.buildToolDraft', () => {
  it('builds an AI-inferred draft from a workflow source', () => {
    const draft = mcpServiceUiUtils.buildToolDraft({
      source: { type: McpToolSourceType.WORKFLOW, workflowId: 'wf1' },
      sourceParams: [
        {
          name: 'workId',
          description: '',
          mode: McpToolParamMode.AI,
          required: true,
          valueType: 'string',
        },
      ],
      titleHint: 'Create Feishu Account',
      taken: [],
    });
    expect(draft.name).toBe('create_feishu_account');
    expect(draft.title).toBe('Create Feishu Account');
    expect(draft.description).toBe('');
    expect(draft.source).toEqual({
      type: McpToolSourceType.WORKFLOW,
      workflowId: 'wf1',
    });
    expect(draft.params).toHaveLength(1);
    expect(draft.id).toBeTruthy();
  });

  it('avoids colliding with existing tool names', () => {
    const draft = mcpServiceUiUtils.buildToolDraft({
      source: {
        type: McpToolSourceType.CONNECTOR_ACTION,
        connectorName: 'feishu',
        actionName: 'create_account',
      },
      sourceParams: [],
      titleHint: 'Create account',
      taken: ['create_account'],
    });
    expect(draft.name).toBe('create_account_2');
  });
});

describe('mcpServiceUiUtils.workflowCandidateBlockedReason', () => {
  it('blocks an unpublished workflow', () => {
    expect(
      mcpServiceUiUtils.workflowCandidateBlockedReason({
        published: false,
        triggerKind: null,
      }),
    ).toBeTruthy();
  });

  it('blocks a workflow without a callable-workflow or webhook trigger', () => {
    expect(
      mcpServiceUiUtils.workflowCandidateBlockedReason({
        published: true,
        triggerKind: null,
      }),
    ).toBeTruthy();
  });

  it('allows a published subflow-triggered workflow', () => {
    expect(
      mcpServiceUiUtils.workflowCandidateBlockedReason({
        published: true,
        triggerKind: McpToolTriggerKind.SUBFLOW,
      }),
    ).toBeNull();
  });

  it('allows a published webhook-triggered workflow for compatibility', () => {
    expect(
      mcpServiceUiUtils.workflowCandidateBlockedReason({
        published: true,
        triggerKind: McpToolTriggerKind.WEBHOOK,
      }),
    ).toBeNull();
  });
});
