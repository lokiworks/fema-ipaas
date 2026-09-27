import { MCP_TOOL_NAME_PATTERN } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { mcpServiceUtils } from '@/features/mcp-services/utils/mcp-service-utils';

describe('mcpServiceUtils.toolNameFor', () => {
  it('turns a workflow name into a snake case tool name', () => {
    expect(
      mcpServiceUtils.toolNameFor({
        displayName: 'Create Feishu Account',
        taken: [],
      }),
    ).toBe('create_feishu_account');
  });

  it('drops accents, punctuation and leading digits', () => {
    expect(
      mcpServiceUtils.toolNameFor({
        displayName: '2024 Café -- Orders!',
        taken: [],
      }),
    ).toBe('cafe_orders');
  });

  it('falls back to a generic name when nothing usable is left', () => {
    expect(
      mcpServiceUtils.toolNameFor({ displayName: '北森入职同步', taken: [] }),
    ).toBe('tool');
    expect(
      mcpServiceUtils.toolNameFor({ displayName: '北森 HR sync', taken: [] }),
    ).toBe('hr_sync');
  });

  it('adds a numeric suffix when the name is taken', () => {
    expect(
      mcpServiceUtils.toolNameFor({
        displayName: '入职',
        taken: ['tool', 'tool_2'],
      }),
    ).toBe('tool_3');
  });

  it('always produces a name that matches the MCP tool name pattern', () => {
    const names = [
      'Sync orders',
      '123',
      '___',
      'a'.repeat(100),
      'Ünïcode wörkflow',
      '飞书 / 钉钉',
    ].map((displayName) =>
      mcpServiceUtils.toolNameFor({
        displayName,
        taken: ['a'.repeat(64)],
      }),
    );
    names.forEach((name) => {
      expect(MCP_TOOL_NAME_PATTERN.test(name)).toBe(true);
      expect(mcpServiceUtils.isValidToolName(name)).toBe(true);
    });
  });
});

describe('mcpServiceUtils.serverKeyFor', () => {
  it('uses dashes and a fallback', () => {
    expect(mcpServiceUtils.serverKeyFor('HR Assistant Tools')).toBe(
      'hr-assistant-tools',
    );
    expect(mcpServiceUtils.serverKeyFor('人事工具')).toBe('mcp-service');
  });
});

describe('mcpServiceUtils.endpointUrl', () => {
  it('derives the MCP endpoint from the webhook URL prefix', () => {
    expect(
      mcpServiceUtils.endpointUrl({
        webhookUrlPrefix: 'https://ipaas.example.com/api/v1/webhooks',
        fallbackApiUrl: 'http://localhost:4200/api',
        serviceId: 'svc1',
      }),
    ).toBe('https://ipaas.example.com/api/v1/mcp/svc1');
  });

  it('falls back to the API URL when the prefix is missing or unexpected', () => {
    expect(
      mcpServiceUtils.endpointUrl({
        webhookUrlPrefix: undefined,
        fallbackApiUrl: 'http://localhost:4200/api/',
        serviceId: 'svc1',
      }),
    ).toBe('http://localhost:4200/api/v1/mcp/svc1');
    expect(
      mcpServiceUtils.endpointUrl({
        webhookUrlPrefix: 'https://hooks.example.com/custom',
        fallbackApiUrl: 'http://localhost:4200/api',
        serviceId: 'svc1',
      }),
    ).toBe('http://localhost:4200/api/v1/mcp/svc1');
  });
});

describe('mcpServiceUtils.maskedToken', () => {
  it('shows only the hint', () => {
    expect(mcpServiceUtils.maskedToken('a1b2')).toBe('••••a1b2');
  });
});
