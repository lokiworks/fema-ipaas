import {
  httpClient,
  HttpError,
  HttpHeaders,
  HttpMethod,
} from '@fema-ipaas/connector-common';
import {
  MCP_PROTOCOL_VERSION,
  McpTool,
  McpToolResult,
  mcpWire,
  tryCatch,
} from '@fema-ipaas/connector-sdk';

export const mcpClient = {
  connect,
  listTools,
  callTool,
};

async function connect({
  url,
  authorization,
}: {
  url: string;
  authorization?: string | null;
}): Promise<McpSession> {
  const nextId = idSequence();
  const target: McpTarget = {
    url: url.trim(),
    authorization: normalizeAuthorization(authorization),
    sessionId: undefined,
  };
  const id = nextId();
  const response = await post({
    target,
    message: mcpWire.request({
      id,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
      },
    }),
  });
  mcpWire.parseMessage({
    contentType: response.contentType,
    text: response.text,
    id,
  });
  const session: McpSession = {
    ...target,
    sessionId: response.sessionId,
    nextId,
  };
  await post({
    target: session,
    message: mcpWire.notification({ method: 'notifications/initialized' }),
  });
  return session;
}

async function listTools({ session }: { session: McpSession }): Promise<McpTool[]> {
  const result = await rpc({ session, method: 'tools/list', params: {} });
  return mcpWire.toolsOf(result);
}

async function callTool({
  session,
  name,
  args,
}: {
  session: McpSession;
  name: string;
  args: Record<string, unknown>;
}): Promise<McpToolResult> {
  const result = await rpc({
    session,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  return mcpWire.toolResultOf(result);
}

async function rpc({
  session,
  method,
  params,
}: {
  session: McpSession;
  method: string;
  params: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const id = session.nextId();
  const response = await post({
    target: session,
    message: mcpWire.request({ id, method, params }),
  });
  return mcpWire.parseMessage({
    contentType: response.contentType,
    text: response.text,
    id,
  }).result;
}

async function post({
  target,
  message,
}: {
  target: McpTarget;
  message: Record<string, unknown>;
}): Promise<McpHttpResponse> {
  const { data, error } = await tryCatch(() =>
    httpClient.sendRequest<string>({
      method: HttpMethod.POST,
      url: target.url,
      headers: mcpWire.headers({
        authorization: target.authorization,
        sessionId: target.sessionId,
      }),
      body: message,
      responseType: 'text',
      timeout: REQUEST_TIMEOUT_MS,
    }),
  );
  if (error !== null) {
    throw new Error(describeFailure({ url: target.url, error }));
  }
  return {
    text: typeof data.body === 'string' ? data.body : '',
    contentType: headerOf({ headers: data.headers, name: 'content-type' }),
    sessionId:
      headerOf({ headers: data.headers, name: 'mcp-session-id' }) ??
      target.sessionId,
  };
}

function describeFailure({ url, error }: { url: string; error: Error }): string {
  if (error instanceof HttpError) {
    const body =
      typeof error.response.body === 'string'
        ? error.response.body
        : JSON.stringify(error.response.body) ?? '';
    const short = body.length > ERROR_BODY_LIMIT ? `${body.slice(0, ERROR_BODY_LIMIT)}…` : body;
    return `MCP server ${url} returned HTTP ${error.response.status}${short.length > 0 ? `: ${short}` : ''}`;
  }
  return `Could not reach MCP server ${url}: ${error.message}`;
}

function headerOf({
  headers,
  name,
}: {
  headers: HttpHeaders | undefined;
  name: string;
}): string | undefined {
  if (headers === undefined) {
    return undefined;
  }
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  const value = key === undefined ? undefined : headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeAuthorization(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null || value.trim().length === 0) {
    return undefined;
  }
  return value.trim();
}

function idSequence(): () => number {
  let current = 0;
  return () => {
    current += 1;
    return current;
  };
}

const CLIENT_NAME = 'workflow-mcp-client';
const CLIENT_VERSION = '1.0.0';
const REQUEST_TIMEOUT_MS = 60000;
const ERROR_BODY_LIMIT = 300;

type McpTarget = {
  url: string;
  authorization: string | undefined;
  sessionId: string | undefined;
};

type McpHttpResponse = {
  text: string;
  contentType: string | undefined;
  sessionId: string | undefined;
};

export type McpSession = McpTarget & {
  nextId: () => number;
};
