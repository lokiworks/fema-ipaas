import { describe, expect, it } from 'vitest';

import { mcpClientSnippets } from '@/features/mcp-services/utils/mcp-client-snippets';

const input = {
  serverKey: 'hr-tools',
  endpoint: 'https://ipaas.example.com/api/v1/mcp/svc1',
  token: 'tok_123',
};

describe('mcpClientSnippets', () => {
  it('builds an mcpServers config with the bearer header', () => {
    expect(JSON.parse(mcpClientSnippets.mcpServersJson(input))).toEqual({
      mcpServers: {
        'hr-tools': {
          url: 'https://ipaas.example.com/api/v1/mcp/svc1',
          headers: { Authorization: 'Bearer tok_123' },
        },
      },
    });
  });

  it('builds a Claude Code command', () => {
    expect(mcpClientSnippets.claudeCodeCommand(input)).toBe(
      "claude mcp add --transport http 'hr-tools' 'https://ipaas.example.com/api/v1/mcp/svc1' --header 'Authorization: Bearer tok_123'",
    );
  });

  it('builds a curl call to tools/list', () => {
    const curl = mcpClientSnippets.curlToolsList(input);
    expect(curl).toContain(
      "curl -X POST 'https://ipaas.example.com/api/v1/mcp/svc1'",
    );
    expect(curl).toContain("-H 'Authorization: Bearer tok_123'");
    expect(curl).toContain("-H 'Accept: application/json, text/event-stream'");
    expect(curl).toContain('"method":"tools/list"');
    expect(curl.split(' \\\n')).toHaveLength(5);
  });

  it('escapes single quotes for the shell', () => {
    expect(
      mcpClientSnippets.claudeCodeCommand({ ...input, serverKey: "it's" }),
    ).toContain("'it'\\''s'");
  });
});
