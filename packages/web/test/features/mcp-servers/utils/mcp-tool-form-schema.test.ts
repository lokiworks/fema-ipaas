import { describe, expect, it } from 'vitest';

import { mcpToolFormUtils } from '@/features/mcp-servers/utils/mcp-tool-form-schema';

describe('mcpToolFormUtils', () => {
  const inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search keywords' },
      limit: { type: 'number' },
      strict: { type: 'boolean' },
      filters: { type: 'object' },
    },
    required: ['query'],
  };

  it('builds one field per schema property with the right kind', () => {
    const fields = mcpToolFormUtils.buildToolFormFields(inputSchema);
    expect(fields).toEqual([
      {
        key: 'query',
        kind: 'string',
        required: true,
        label: 'query',
        description: 'Search keywords',
      },
      { key: 'limit', kind: 'number', required: false, label: 'limit', description: undefined },
      { key: 'strict', kind: 'boolean', required: false, label: 'strict', description: undefined },
      { key: 'filters', kind: 'json', required: false, label: 'filters', description: undefined },
    ]);
  });

  it('returns no fields when the schema has no properties', () => {
    expect(mcpToolFormUtils.buildToolFormFields(undefined)).toEqual([]);
    expect(mcpToolFormUtils.buildToolFormFields({})).toEqual([]);
  });

  it('rejects a missing required field', () => {
    const fields = mcpToolFormUtils.buildToolFormFields(inputSchema);
    const schema = mcpToolFormUtils.buildToolFormSchema(fields);
    const result = schema.safeParse({ query: '', limit: '', strict: '', filters: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric value for a number field', () => {
    const fields = mcpToolFormUtils.buildToolFormFields(inputSchema);
    const schema = mcpToolFormUtils.buildToolFormSchema(fields);
    const result = schema.safeParse({
      query: 'hello',
      limit: 'not-a-number',
      strict: '',
      filters: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid JSON for a json field', () => {
    const fields = mcpToolFormUtils.buildToolFormFields(inputSchema);
    const schema = mcpToolFormUtils.buildToolFormSchema(fields);
    const result = schema.safeParse({
      query: 'hello',
      limit: '5',
      strict: 'true',
      filters: '{not valid json',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a fully valid submission', () => {
    const fields = mcpToolFormUtils.buildToolFormFields(inputSchema);
    const schema = mcpToolFormUtils.buildToolFormSchema(fields);
    const result = schema.safeParse({
      query: 'hello',
      limit: '5',
      strict: 'true',
      filters: '{"a":1}',
    });
    expect(result.success).toBe(true);
  });

  it('parses form values into typed tool arguments, skipping blanks', () => {
    const fields = mcpToolFormUtils.buildToolFormFields(inputSchema);
    const args = mcpToolFormUtils.parseToolFormValues({
      fields,
      values: { query: 'hello', limit: '5', strict: 'true', filters: '' },
    });
    expect(args).toEqual({ query: 'hello', limit: 5, strict: true });
  });
});
