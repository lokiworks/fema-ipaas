import {
  MCP_PROTOCOL_VERSION,
  McpTool,
  McpToolResult,
  mcpWire,
} from '@fema-ipaas/connector-sdk';
import { McpTarget, McpTransport } from './mcp-target';

export const mcpClient = {
  connect,
  listTools,
  callTool,
  close,
  describeFailure,
};

async function connect({ target, timeoutMs = REQUEST_TIMEOUT_MS }: { target: McpTarget; timeoutMs?: number }): Promise<McpSession> {
  const channel = target.transport === McpTransport.SSE
    ? await openSseChannel({ target, timeoutMs })
    : openStreamableChannel({ target, timeoutMs });
  const nextId = idSequence();
  const session: McpSession = { url: target.url, channel, nextId };
  try {
    await request({
      session,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
      },
    });
    await channel.send({ message: mcpWire.notification({ method: 'notifications/initialized' }), expectId: undefined });
  }
  catch (error) {
    await channel.close();
    throw error;
  }
  return session;
}

async function listTools({ session }: { session: McpSession }): Promise<McpTool[]> {
  const result = await request({ session, method: 'tools/list', params: {} });
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
  const result = await request({
    session,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  return mcpWire.toolResultOf(result);
}

async function close({ session }: { session: McpSession }): Promise<void> {
  await session.channel.close();
}

function describeFailure({ url, error }: { url: string; error: unknown }): string {
  if (error instanceof McpHttpError) {
    const short = error.body.length > ERROR_BODY_LIMIT ? `${error.body.slice(0, ERROR_BODY_LIMIT)}…` : error.body;
    return `MCP server ${url} returned HTTP ${error.status}${short.length > 0 ? `: ${short}` : ''}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `Could not reach MCP server ${url}: ${message}`;
}

async function request({
  session,
  method,
  params,
}: {
  session: McpSession;
  method: string;
  params: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const id = session.nextId();
  const result = await session.channel.send({ message: mcpWire.request({ id, method, params }), expectId: id });
  return result ?? {};
}

function openStreamableChannel({ target, timeoutMs }: { target: McpTarget; timeoutMs: number }): McpChannel {
  const state: { sessionId: string | undefined } = { sessionId: undefined };
  return {
    async send({ message, expectId }) {
      const response = await fetchOrThrow({
        url: target.url,
        init: {
          method: 'POST',
          headers: mcpWire.headers({ authorization: target.authorization, sessionId: state.sessionId }),
          body: JSON.stringify(message),
        },
        timeoutMs,
      });
      state.sessionId = response.headers.get('mcp-session-id') ?? state.sessionId;
      const text = await response.text();
      if (expectId === undefined) {
        return null;
      }
      return mcpWire.parseMessage({
        contentType: response.headers.get('content-type') ?? undefined,
        text,
        id: expectId,
      }).result;
    },
    async close() {
      return;
    },
  };
}

async function openSseChannel({ target, timeoutMs }: { target: McpTarget; timeoutMs: number }): Promise<McpChannel> {
  const controller = new AbortController();
  const pending = new Map<number, Deferred<Record<string, unknown>>>();
  const endpoint = deferred<string>();
  const connectTimer = setTimeout(() => controller.abort(new McpTimeoutError(target.url)), timeoutMs);
  const response = await fetchOrThrow({
    url: target.url,
    init: {
      method: 'GET',
      headers: {
        accept: 'text/event-stream',
        ...(target.authorization === undefined ? {} : { authorization: mcpWire.headers({ authorization: target.authorization }).authorization }),
      },
      signal: controller.signal,
    },
    timeoutMs: undefined,
  }).finally(() => clearTimeout(connectTimer));
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || response.body === null) {
    controller.abort();
    throw new McpTransportMismatchError(target.url);
  }
  void readEvents({
    body: response.body,
    onEvent: ({ event, data }) => {
      if (event === 'endpoint') {
        endpoint.resolve(new URL(data.trim(), target.url).toString());
        return;
      }
      if (event === 'message' || event === '') {
        dispatchMessage({ data, pending });
      }
    },
  }).catch((error: unknown) => {
    const failure = error instanceof Error ? error : new Error(String(error));
    endpoint.reject(failure);
    pending.forEach((waiter) => waiter.reject(failure));
  });
  const endpointUrl = await withTimeout({ promise: endpoint.promise, timeoutMs, url: target.url });
  return {
    async send({ message, expectId }) {
      const waiter = expectId === undefined ? undefined : deferred<Record<string, unknown>>();
      if (expectId !== undefined && waiter !== undefined) {
        pending.set(expectId, waiter);
      }
      try {
        await fetchOrThrow({
          url: endpointUrl,
          init: {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(target.authorization === undefined ? {} : { authorization: mcpWire.headers({ authorization: target.authorization }).authorization }),
            },
            body: JSON.stringify(message),
          },
          timeoutMs,
        }).then((sent) => sent.text());
        if (waiter === undefined) {
          return null;
        }
        return await withTimeout({ promise: waiter.promise, timeoutMs, url: target.url });
      }
      finally {
        if (expectId !== undefined) {
          pending.delete(expectId);
        }
      }
    },
    async close() {
      controller.abort();
    },
  };
}

function dispatchMessage({ data, pending }: { data: string; pending: Map<number, Deferred<Record<string, unknown>>> }): void {
  const parsed = safeJson(data);
  if (!isRecord(parsed) || typeof parsed['id'] !== 'number') {
    return;
  }
  const waiter = pending.get(parsed['id']);
  if (waiter === undefined) {
    return;
  }
  try {
    waiter.resolve(mcpWire.parseMessage({ contentType: 'application/json', text: data, id: parsed['id'] }).result);
  }
  catch (error) {
    waiter.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

async function readEvents({ body, onEvent }: { body: ReadableStream<Uint8Array>; onEvent: (event: SseEvent) => void }): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';
    blocks.map(parseEventBlock).forEach((event) => {
      if (event !== null) {
        onEvent(event);
      }
    });
  }
}

function parseEventBlock(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  const event = lines.find((line) => line.startsWith('event:'))?.slice('event:'.length).trim() ?? '';
  const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice('data:'.length).replace(/^ /, '')).join('\n');
  if (data.length === 0 && event.length === 0) {
    return null;
  }
  return { event, data };
}

async function fetchOrThrow({ url, init, timeoutMs }: { url: string; init: RequestInit; timeoutMs: number | undefined }): Promise<Response> {
  const signal = init.signal ?? (timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs));
  const response = await fetch(url, { ...init, ...(signal === undefined ? {} : { signal }) }).catch((error: unknown) => {
    if (isAbortError(error)) {
      throw new McpTimeoutError(url);
    }
    throw error;
  });
  if (response.status < 200 || response.status >= 300) {
    const body = await response.text().catch(() => '');
    throw new McpHttpError({ url, status: response.status, body });
  }
  return response;
}

async function withTimeout<T>({ promise, timeoutMs, url }: { promise: Promise<T>; timeoutMs: number; url: string }): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new McpTimeoutError(url)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  }
  finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function deferred<T>(): Deferred<T> {
  const handlers: { resolve: (value: T) => void; reject: (error: Error) => void } = {
    resolve: () => undefined,
    reject: () => undefined,
  };
  const promise = new Promise<T>((resolve, reject) => {
    handlers.resolve = resolve;
    handlers.reject = reject;
  });
  promise.catch(() => undefined);
  return { promise, resolve: (value) => handlers.resolve(value), reject: (error) => handlers.reject(error) };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function safeJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  }
  catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function idSequence(): () => number {
  let current = 0;
  return () => {
    current += 1;
    return current;
  };
}

export class McpHttpError extends Error {
  readonly url: string;
  readonly status: number;
  readonly body: string;

  constructor({ url, status, body }: { url: string; status: number; body: string }) {
    super(`MCP server ${url} returned HTTP ${status}`);
    this.name = 'McpHttpError';
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

export class McpTimeoutError extends Error {
  constructor(url: string) {
    super(`MCP server ${url} did not respond in time`);
    this.name = 'McpTimeoutError';
  }
}

export class McpTransportMismatchError extends Error {
  constructor(url: string) {
    super(`MCP server ${url} did not open an SSE stream`);
    this.name = 'McpTransportMismatchError';
  }
}

const CLIENT_NAME = 'workflow-mcp-client';
const CLIENT_VERSION = '1.0.0';
const REQUEST_TIMEOUT_MS = 60000;
const ERROR_BODY_LIMIT = 300;

type SseEvent = {
  event: string;
  data: string;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

type McpChannel = {
  send: (params: { message: Record<string, unknown>; expectId: number | undefined }) => Promise<Record<string, unknown> | null>;
  close: () => Promise<void>;
};

export type McpSession = {
  url: string;
  channel: McpChannel;
  nextId: () => number;
};
