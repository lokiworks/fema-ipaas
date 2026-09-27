function cursorConfig({ serverKey, endpoint, token }: SnippetInput): string {
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

function genericHttpConfig({
  serverKey,
  endpoint,
  token,
}: SnippetInput): string {
  return JSON.stringify(
    {
      mcpServers: {
        [serverKey]: {
          type: 'http',
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export const mcpClientSnippets = {
  cursorConfig,
  genericHttpConfig,
  claudeCodeCommand,
};

export type SnippetInput = {
  serverKey: string;
  endpoint: string;
  token: string;
};
