/// <reference types="vitest/globals" />

export const fakeHttp = {
  install,
  jsonResponse,
  mcpServer,
};

function install({ routes }: { routes: Record<string, RouteHandler> }): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = headersOf(init?.headers);
    const body = typeof init?.body === 'string' ? parseBody(init.body) : null;
    const request = { url, headers, body };
    requests.push(request);
    const handler = routes[url];
    if (handler === undefined) {
      return new Response('not found', { status: 404 });
    }
    return handler(request);
  });
  return requests;
}

function jsonResponse({
  body,
  status = 200,
  headers = {},
}: {
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function mcpServer({
  sessionId,
  tools,
  onCall,
}: {
  sessionId: string;
  tools: { name: string; description: string }[];
  onCall: (params: { name: string; arguments: unknown }) => Record<string, unknown>;
}): RouteHandler {
  return (request) => {
    const message = isRecord(request.body) ? request.body : {};
    const id = message['id'];
    switch (message['method']) {
      case 'initialize':
        return jsonResponse({
          body: { jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } },
          headers: { 'mcp-session-id': sessionId },
        });
      case 'notifications/initialized':
        return new Response(null, { status: 202 });
      case 'tools/list':
        return new Response(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              tools: tools.map((tool) => ({
                ...tool,
                inputSchema: { type: 'object', properties: {} },
              })),
            },
          })}\n\n`,
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      case 'tools/call': {
        const params = isRecord(message['params']) ? message['params'] : {};
        return jsonResponse({
          body: {
            jsonrpc: '2.0',
            id,
            result: onCall({ name: String(params['name']), arguments: params['arguments'] }),
          },
        });
      }
      default:
        return jsonResponse({
          body: { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } },
        });
    }
  };
}

function headersOf(value: HeadersInit | undefined): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  return Object.fromEntries(new Headers(value).entries());
}

function parseBody(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type RecordedRequest = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

export type RouteHandler = (request: RecordedRequest) => Response;
