import { McpServerProbeError, McpServerProbeFailure } from '@fema-ipaas/shared';
import { t } from 'i18next';

function failureMessage(error: McpServerProbeError): string {
  const { host, detail } = error;
  switch (error.failure) {
    case McpServerProbeFailure.LOOPBACK:
      return t(
        'Connection failed: {host} points to the worker itself. Both the connection test and tool calls are made by the worker, and localhost only works on your own computer. Enter an address or domain the worker can reach.',
        { host },
      );
    case McpServerProbeFailure.LINK_LOCAL:
      return t(
        'Connection refused: {host} is a link-local address, often used by cloud metadata services. For security, the worker will not access this kind of address.',
        { host },
      );
    case McpServerProbeFailure.PRIVATE_UNREACHABLE:
      return t(
        "Connection timed out: {host} did not respond. This is a private address that the worker's network cannot reach, or an outbound security policy is blocking it. Check network connectivity, and ask an operator to add this range to FEMA_SSRF_ALLOW_LIST.",
        { host },
      );
    case McpServerProbeFailure.DNS:
      return t(
        "Could not resolve domain {host}: DNS on the worker's network cannot find this address. Check the spelling and make sure the worker can resolve this domain.",
        { host },
      );
    case McpServerProbeFailure.TRANSPORT_MISMATCH:
      return t(
        'The server returned 405 Method Not Allowed: the transport does not match the address. Switch the transport to SSE, or use the Streamable HTTP address instead, which usually ends in /mcp.',
      );
    case McpServerProbeFailure.UNAUTHORIZED:
      return t(
        'The server returned 401 Unauthorized: the token is invalid or expired. Use a different token.',
      );
    case McpServerProbeFailure.OAUTH_NOT_AUTHORIZED:
      return t(
        'OAuth authorization has not been completed yet. Click "Authorize" first.',
      );
    case McpServerProbeFailure.TIMEOUT:
      return t(
        'Connection timed out: {host} did not respond in time. {detail}',
        {
          host,
          detail,
        },
      );
    case McpServerProbeFailure.UNREACHABLE:
      return t('Could not reach {host}. {detail}', { host, detail });
    case McpServerProbeFailure.PROTOCOL:
      return t(
        "The server's response did not follow the MCP protocol. {detail}",
        {
          detail,
        },
      );
    case McpServerProbeFailure.INVALID_URL:
      return t('The server address is not valid. {detail}', { detail });
    case McpServerProbeFailure.WORKER_UNAVAILABLE:
      return t(
        'No worker is available to run the connection test right now. {detail}',
        { detail },
      );
  }
}

function successMessage({
  toolCount,
  latencyMs,
}: {
  toolCount: number;
  latencyMs: number;
}): string {
  return t('Connected, found {count} tools · latency {latency} ms', {
    count: toolCount,
    latency: latencyMs,
  });
}

function insecureHttpWarning(): string {
  return t(
    'This address uses plain HTTP. The token and tool results could be intercepted; switching to HTTPS is recommended.',
  );
}

export const mcpProbeMessageUtils = {
  failureMessage,
  successMessage,
  insecureHttpWarning,
};
