import { MCP_TOOL_NAME_PATTERN } from '@fema-ipaas/shared';

function slugify({
  text,
  separator,
  fallback,
}: {
  text: string;
  separator: '_' | '-';
  fallback: string;
}): string {
  const words = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
  const joined = words.join(separator).replace(/^[0-9]+/, '');
  const trimmed = trimSeparators({
    text: joined.slice(0, MAX_NAME_LENGTH),
    separator,
  });
  return trimmed.length > 0 ? trimmed : fallback;
}

function toolNameFor({
  displayName,
  taken,
}: {
  displayName: string;
  taken: string[];
}): string {
  const base = slugify({
    text: displayName,
    separator: '_',
    fallback: DEFAULT_TOOL_NAME,
  });
  if (!taken.includes(base)) {
    return base;
  }
  const suffixes = Array.from({ length: taken.length + 1 }, (_, i) => i + 2);
  const unique = suffixes
    .map((suffix) => withSuffix({ base, suffix }))
    .find((candidate) => !taken.includes(candidate));
  return unique ?? base;
}

function isValidToolName(name: string): boolean {
  return MCP_TOOL_NAME_PATTERN.test(name);
}

function serverKeyFor(name: string): string {
  return slugify({ text: name, separator: '-', fallback: DEFAULT_SERVER_KEY });
}

function endpointUrl({
  webhookUrlPrefix,
  fallbackApiUrl,
  serviceId,
}: {
  webhookUrlPrefix: string | undefined;
  fallbackApiUrl: string;
  serviceId: string;
}): string {
  const prefix = (webhookUrlPrefix ?? '').replace(/\/+$/, '');
  const base = prefix.endsWith(WEBHOOKS_PATH)
    ? prefix.slice(0, prefix.length - WEBHOOKS_PATH.length)
    : fallbackApiUrl.replace(/\/+$/, '');
  return `${base}/v1/mcp/${serviceId}`;
}

function maskedToken(tokenHint: string): string {
  return `••••${tokenHint}`;
}

function trimSeparators({
  text,
  separator,
}: {
  text: string;
  separator: string;
}): string {
  const edges = new RegExp(`^[${separator}]+|[${separator}]+$`, 'g');
  return text.replace(edges, '');
}

function withSuffix({ base, suffix }: { base: string; suffix: number }) {
  const tail = `_${suffix}`;
  return `${base.slice(0, MAX_NAME_LENGTH - tail.length)}${tail}`;
}

const MAX_NAME_LENGTH = 64;
const DEFAULT_TOOL_NAME = 'tool';
const DEFAULT_SERVER_KEY = 'mcp-service';
const WEBHOOKS_PATH = '/v1/webhooks';

export const mcpServiceUtils = {
  slugify,
  toolNameFor,
  isValidToolName,
  serverKeyFor,
  endpointUrl,
  maskedToken,
};
