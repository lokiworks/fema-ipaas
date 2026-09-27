import { McpServerUrlIssue } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { mcpUrlIssueUtils } from '@/features/mcp-servers/utils/mcp-url-issue-messages';

describe('mcpUrlIssueUtils', () => {
  it('describes every url issue with a non-empty message', () => {
    for (const issue of Object.values(McpServerUrlIssue)) {
      expect(mcpUrlIssueUtils.urlIssueMessage(issue).length).toBeGreaterThan(0);
    }
  });

  it('mentions the scheme requirement', () => {
    expect(mcpUrlIssueUtils.urlIssueMessage(McpServerUrlIssue.SCHEME)).toContain(
      'http',
    );
  });

  it('mentions credentials should go in authentication', () => {
    expect(
      mcpUrlIssueUtils.urlIssueMessage(McpServerUrlIssue.CREDENTIALS),
    ).toContain('Authentication');
  });
});
