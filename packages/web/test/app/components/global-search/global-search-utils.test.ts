import { GlobalSearchResultType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { globalSearchUtils } from '@/app/components/global-search/global-search-utils';

function item(type: GlobalSearchResultType, projectId: string | null = 'p2') {
  return {
    id: 'x1',
    type,
    label: 'Orders sync',
    subtitle: null,
    projectId,
    projectName: 'Sales',
  };
}

describe('globalSearchUtils.itemHref', () => {
  it('links project resources inside their own project', () => {
    expect(
      globalSearchUtils.itemHref({
        item: item(GlobalSearchResultType.WORKFLOW),
        currentProjectId: 'p1',
      }),
    ).toBe('/projects/p2/workflows/x1');
    expect(
      globalSearchUtils.itemHref({
        item: item(GlobalSearchResultType.ISSUE),
        currentProjectId: 'p1',
      }),
    ).toBe('/projects/p2/issues/x1');
    expect(
      globalSearchUtils.itemHref({
        item: item(GlobalSearchResultType.MAPPING_TABLE),
        currentProjectId: 'p1',
      }),
    ).toBe('/projects/p2/mapping-tables?id=x1');
    expect(
      globalSearchUtils.itemHref({
        item: item(GlobalSearchResultType.DATA_STORE),
        currentProjectId: 'p1',
      }),
    ).toBe('/projects/p2/data-stores?id=x1');
  });

  it('links tenant resources to their tenant pages', () => {
    expect(
      globalSearchUtils.itemHref({
        item: {
          ...item(GlobalSearchResultType.CONNECTOR, null),
          id: '@fema-ipaas/connector-slack',
        },
        currentProjectId: 'p1',
      }),
    ).toBe('/tenant/connectors/detail/%40fema-ipaas%2Fconnector-slack');
    expect(
      globalSearchUtils.itemHref({
        item: item(GlobalSearchResultType.MCP_SERVER, null),
        currentProjectId: 'p1',
      }),
    ).toBe('/tenant/connectors/mcp/x1');
    expect(
      globalSearchUtils.itemHref({
        item: item(GlobalSearchResultType.CONNECTION, null),
        currentProjectId: 'p1',
      }),
    ).toBe('/projects/p1/connections?id=x1');
  });
});

describe('globalSearchUtils.toRows', () => {
  it('adds a view-all row only when the group has more results', () => {
    const group = {
      type: GlobalSearchResultType.ISSUE,
      items: [item(GlobalSearchResultType.ISSUE)],
      hasMore: true,
    };
    const rows = globalSearchUtils.toRows({
      group,
      query: 'time out',
      currentProjectId: 'p1',
    });
    expect(rows.map((row) => row.kind)).toEqual(['resource', 'view-all']);
    expect(rows[1].href).toBe('/projects/p1/issues?search=time%20out');
    expect(
      globalSearchUtils.toRows({
        group: { ...group, hasMore: false },
        query: 'x',
        currentProjectId: 'p1',
      }),
    ).toHaveLength(1);
  });
});
