import { describe, expect, it } from 'vitest';

import { mcpClientSnippets } from '@/features/mcp-services/utils/mcp-client-snippets';

const input = {
  serverKey: 'hr-tools',
  endpoint: 'https://ipaas.example.com/api/mcp/hr-tools',
  token: 'mcp_sk_abcdefghijklmn',
};

describe('mcpClientSnippets', () => {
  it('builds a Cursor mcpServers config with the bearer header', () => {
    expect(JSON.parse(mcpClientSnippets.cursorConfig(input))).toEqual({
      mcpServers: {
        'hr-tools': {
          url: input.endpoint,
          headers: { Authorization: `Bearer ${input.token}` },
        },
      },
    });
  });

  it('builds a generic http config with a type field', () => {
    expect(JSON.parse(mcpClientSnippets.genericHttpConfig(input))).toEqual({
      mcpServers: {
        'hr-tools': {
          type: 'http',
          url: input.endpoint,
          headers: { Authorization: `Bearer ${input.token}` },
        },
      },
    });
  });

  it('builds a Claude Code command', () => {
    expect(mcpClientSnippets.claudeCodeCommand(input)).toBe(
      `claude mcp add --transport http 'hr-tools' '${input.endpoint}' --header 'Authorization: Bearer ${input.token}'`,
    );
  });

  it('escapes single quotes for the shell', () => {
    expect(
      mcpClientSnippets.claudeCodeCommand({ ...input, serverKey: "it's" }),
    ).toContain("'it'\\''s'");
  });
});
