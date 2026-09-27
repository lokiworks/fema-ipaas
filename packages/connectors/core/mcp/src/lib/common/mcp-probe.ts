import { lookup } from 'node:dns/promises';
import { McpTool } from '@fema-ipaas/connector-sdk';
import { McpHttpError, mcpClient, McpTimeoutError, McpTransportMismatchError } from './mcp-client';
import { McpAuthType, McpTarget } from './mcp-target';
import { AddressKind, networkAddress } from './network-address';

export const mcpProbe = {
  probe,
  classifyError,
};

async function probe({ target, resolveHost = defaultResolveHost, timeoutMs = PROBE_TIMEOUT_MS }: ProbeParams): Promise<McpProbeResult> {
  const parsed = parseUrl(target.url);
  if (parsed === null) {
    return failure({ failure: McpProbeFailure.INVALID_URL, detail: 'The server address is not a valid http(s) URL', host: target.url });
  }
  const host = parsed.host;
  const literalKind = networkAddress.classifyHost(parsed.hostname);
  if (literalKind === AddressKind.LOOPBACK || literalKind === AddressKind.LINK_LOCAL) {
    return failure({ failure: kindFailure(literalKind), detail: `${host} is not reachable from the worker`, host });
  }
  const resolved: ResolvedHost = networkAddress.isIpLiteral(parsed.hostname)
    ? { kinds: [literalKind], error: null }
    : await resolveHost(parsed.hostname).then(
      (addresses) => ({ kinds: addresses.map((address) => networkAddress.classifyIp(address)), error: null }),
      (error: unknown) => ({ kinds: [], error }),
    );
  if (resolved.error !== null) {
    return failure(classifyError({ error: resolved.error, target, host, privateAddress: false }));
  }
  const resolvedBlocked = resolved.kinds.find((kind) => kind === AddressKind.LOOPBACK || kind === AddressKind.LINK_LOCAL);
  if (resolvedBlocked !== undefined) {
    return failure({ failure: kindFailure(resolvedBlocked), detail: `${host} resolves to an address the worker does not call`, host });
  }
  const privateAddress = resolved.kinds.includes(AddressKind.PRIVATE);
  const started = Date.now();
  try {
    const session = await mcpClient.connect({ target, timeoutMs });
    try {
      const tools = await mcpClient.listTools({ session });
      return {
        ok: true,
        tools: tools.map(toProbeTool),
        latencyMs: Date.now() - started,
        insecureHttp: parsed.protocol === 'http:' && !privateAddress,
      };
    }
    finally {
      await mcpClient.close({ session });
    }
  }
  catch (error) {
    return failure(classifyError({ error, target, host, privateAddress }));
  }
}

function classifyError({ error, target, host, privateAddress }: ClassifyParams): McpProbeError {
  if (error instanceof McpHttpError) {
    if (error.status === 405 || error.status === 406) {
      return { failure: McpProbeFailure.TRANSPORT_MISMATCH, detail: mcpClient.describeFailure({ url: target.url, error }), host };
    }
    if (error.status === 401 || error.status === 403) {
      const notAuthorized = target.authType === McpAuthType.OAUTH2 && target.authorization === undefined;
      return {
        failure: notAuthorized ? McpProbeFailure.OAUTH_NOT_AUTHORIZED : McpProbeFailure.UNAUTHORIZED,
        detail: mcpClient.describeFailure({ url: target.url, error }),
        host,
      };
    }
    return { failure: McpProbeFailure.PROTOCOL, detail: mcpClient.describeFailure({ url: target.url, error }), host };
  }
  if (error instanceof McpTransportMismatchError) {
    return { failure: McpProbeFailure.TRANSPORT_MISMATCH, detail: error.message, host };
  }
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (isSsrfBlock(error)) {
    return { failure: McpProbeFailure.PRIVATE_UNREACHABLE, detail: message, host };
  }
  if (DNS_CODES.includes(code)) {
    return { failure: McpProbeFailure.DNS, detail: message, host };
  }
  const timedOut = error instanceof McpTimeoutError || TIMEOUT_CODES.includes(code);
  if (privateAddress && (timedOut || UNREACHABLE_CODES.includes(code))) {
    return { failure: McpProbeFailure.PRIVATE_UNREACHABLE, detail: message, host };
  }
  if (timedOut) {
    return { failure: McpProbeFailure.TIMEOUT, detail: message, host };
  }
  if (UNREACHABLE_CODES.includes(code)) {
    return { failure: McpProbeFailure.UNREACHABLE, detail: message, host };
  }
  return { failure: McpProbeFailure.PROTOCOL, detail: message, host };
}

function toProbeTool(tool: McpTool): McpProbeTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.title === undefined ? {} : { title: tool.title }),
    ...(tool.readOnly === undefined ? {} : { readOnly: tool.readOnly }),
  };
}

function kindFailure(kind: AddressKind): McpProbeFailure {
  return kind === AddressKind.LINK_LOCAL ? McpProbeFailure.LINK_LOCAL : McpProbeFailure.LOOPBACK;
}

function failure(error: McpProbeError): McpProbeResult {
  return { ok: false, error };
}

function errorCode(error: unknown): string {
  const direct = readCode(error);
  if (direct.length > 0) {
    return direct;
  }
  return error instanceof Error ? readCode(error.cause) : '';
}

function readCode(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('code' in value)) {
    return '';
  }
  return typeof value.code === 'string' ? value.code : '';
}

function isSsrfBlock(error: unknown): boolean {
  const names = [error, error instanceof Error ? error.cause : undefined]
    .map((candidate) => (candidate instanceof Error ? `${candidate.name} ${candidate.message}` : ''))
    .join(' ');
  return /ssrf/i.test(names);
}

function parseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  }
  catch {
    return null;
  }
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const addresses = await lookup(hostname, { all: true });
  return addresses.map((address) => address.address);
}

export enum McpProbeFailure {
  INVALID_URL = 'INVALID_URL',
  LOOPBACK = 'LOOPBACK',
  LINK_LOCAL = 'LINK_LOCAL',
  PRIVATE_UNREACHABLE = 'PRIVATE_UNREACHABLE',
  DNS = 'DNS',
  TRANSPORT_MISMATCH = 'TRANSPORT_MISMATCH',
  UNAUTHORIZED = 'UNAUTHORIZED',
  OAUTH_NOT_AUTHORIZED = 'OAUTH_NOT_AUTHORIZED',
  TIMEOUT = 'TIMEOUT',
  UNREACHABLE = 'UNREACHABLE',
  PROTOCOL = 'PROTOCOL',
}

const PROBE_TIMEOUT_MS = 10000;
const DNS_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NONAME', 'ENODATA'];
const TIMEOUT_CODES = ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'ESOCKETTIMEDOUT'];
const UNREACHABLE_CODES = ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'UND_ERR_SOCKET'];

type ProbeParams = {
  target: McpTarget;
  resolveHost?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
};

type ResolvedHost = {
  kinds: AddressKind[];
  error: unknown;
};

type ClassifyParams = {
  error: unknown;
  target: McpTarget;
  host: string;
  privateAddress: boolean;
};

export type McpProbeTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
};

export type McpProbeError = {
  failure: McpProbeFailure;
  detail: string;
  host: string;
};

export type McpProbeResult =
  | { ok: true; tools: McpProbeTool[]; latencyMs: number; insecureHttp: boolean }
  | { ok: false; error: McpProbeError };
