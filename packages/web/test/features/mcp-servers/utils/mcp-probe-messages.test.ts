import { McpServerProbeFailure } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { mcpProbeMessageUtils } from '@/features/mcp-servers/utils/mcp-probe-messages';

describe('mcpProbeMessageUtils', () => {
  it('describes a loopback failure with the host', () => {
    const message = mcpProbeMessageUtils.failureMessage({
      failure: McpServerProbeFailure.LOOPBACK,
      detail: 'connect ECONNREFUSED 127.0.0.1',
      host: 'localhost',
    });
    expect(message).toContain('localhost');
    expect(message).toContain('worker itself');
  });

  it('describes a link-local failure with the host', () => {
    const message = mcpProbeMessageUtils.failureMessage({
      failure: McpServerProbeFailure.LINK_LOCAL,
      detail: '',
      host: '169.254.169.254',
    });
    expect(message).toContain('169.254.169.254');
    expect(message).toContain('link-local');
  });

  it('describes a DNS failure with the host', () => {
    const message = mcpProbeMessageUtils.failureMessage({
      failure: McpServerProbeFailure.DNS,
      detail: '',
      host: 'mcp.invalid-domain.example',
    });
    expect(message).toContain('mcp.invalid-domain.example');
    expect(message).toContain('DNS');
  });

  it('describes a transport mismatch without needing the host', () => {
    const message = mcpProbeMessageUtils.failureMessage({
      failure: McpServerProbeFailure.TRANSPORT_MISMATCH,
      detail: '',
      host: 'mcp.example.com',
    });
    expect(message).toContain('405');
  });

  it('describes an unauthorized failure', () => {
    const message = mcpProbeMessageUtils.failureMessage({
      failure: McpServerProbeFailure.UNAUTHORIZED,
      detail: '',
      host: 'mcp.example.com',
    });
    expect(message).toContain('401');
  });

  it('describes a missing OAuth authorization', () => {
    const message = mcpProbeMessageUtils.failureMessage({
      failure: McpServerProbeFailure.OAUTH_NOT_AUTHORIZED,
      detail: '',
      host: 'mcp.example.com',
    });
    expect(message).toContain('Authorize');
  });

  it('includes the raw detail for generic failures', () => {
    const message = mcpProbeMessageUtils.failureMessage({
      failure: McpServerProbeFailure.PROTOCOL,
      detail: 'unexpected response shape',
      host: 'mcp.example.com',
    });
    expect(message).toContain('unexpected response shape');
  });

  it('produces distinct messages for every failure reason', () => {
    const messages = new Set(
      Object.values(McpServerProbeFailure).map((failure) =>
        mcpProbeMessageUtils.failureMessage({
          failure,
          detail: 'detail',
          host: 'host',
        }),
      ),
    );
    expect(messages.size).toBe(Object.values(McpServerProbeFailure).length);
  });

  it('formats a success message with the tool count and latency', () => {
    const message = mcpProbeMessageUtils.successMessage({
      toolCount: 5,
      latencyMs: 128,
    });
    expect(message).toContain('5');
    expect(message).toContain('128');
  });

  it('warns about plain HTTP', () => {
    expect(mcpProbeMessageUtils.insecureHttpWarning()).toContain('HTTPS');
  });
});
