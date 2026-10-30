import { describe, expect, it } from 'vitest';

import { STATIC_PAGES } from '@/app/components/global-search/static-pages';

describe('STATIC_PAGES', () => {
  it('lists every second-level project page under its sidebar name', () => {
    const projectPages = STATIC_PAGES.filter((page) => page.projectScoped).map(
      (page) => [page.label, page.href],
    );
    expect(projectPages).toEqual(
      expect.arrayContaining([
        ['Project config', '/variables'],
        ['Releases and approvals', '/releases'],
        ['Releases and approvals — Change history', '/releases?tab=history'],
        ['Mapping tables', '/mapping-tables'],
        ['Data stores', '/data-stores'],
        ['Agent approvals', '/agent-approvals'],
        ['MCP services', '/mcp-services'],
        ['Connections', '/connections'],
      ]),
    );
  });

  it('names the rail pages the way the rail does', () => {
    const labels = STATIC_PAGES.map((page) => page.label);
    expect(labels).toEqual(
      expect.arrayContaining(['Logs', 'Issues', 'Monitoring']),
    );
  });

  it('has unique ids', () => {
    const ids = STATIC_PAGES.map((page) => page.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
