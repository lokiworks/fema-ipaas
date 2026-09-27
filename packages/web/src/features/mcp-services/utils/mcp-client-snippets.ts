function mcpServersJson({ serverKey, endpoint, token }: SnippetInput): string {
  return JSON.stringify(
    {
      mcpServers: {
        [serverKey]: {
          url: endpoint,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

function claudeCodeCommand({
  serverKey,
  endpoint,
  token,
}: SnippetInput): string {
  return [
    `claude mcp add --transport http ${shellQuote(serverKey)}`,
    shellQuote(endpoint),
    `--header ${shellQuote(`Authorization: Bearer ${token}`)}`,
  ].join(' ');
}

function curlToolsList({
  endpoint,
  token,
}: Omit<SnippetInput, 'serverKey'>): string {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });
  return [
    `curl -X POST ${shellQuote(endpoint)}`,
    `  -H ${shellQuote(`Authorization: Bearer ${token}`)}`,
    `  -H ${shellQuote('Content-Type: application/json')}`,
    `  -H ${shellQuote('Accept: application/json, text/event-stream')}`,
    `  -d ${shellQuote(body)}`,
  ].join(' \\\n');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export const mcpClientSnippets = {
  mcpServersJson,
  claudeCodeCommand,
  curlToolsList,
};

type SnippetInput = { serverKey: string; endpoint: string; token: string };
