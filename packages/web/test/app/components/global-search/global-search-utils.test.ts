import { GlobalSearchResultType, TenantModule } from '@fema-ipaas/shared';
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

describe('globalSearchUtils.prioritizeCurrentProject', () => {
  const workflow = (id: string, projectId: string) => ({
    ...item(GlobalSearchResultType.WORKFLOW, projectId),
    id,
  });

  it('puts results of the current project first and keeps the rest in order', () => {
    const group = {
      type: GlobalSearchResultType.WORKFLOW,
      items: [workflow('a', 'p2'), workflow('b', 'p1'), workflow('c', 'p2')],
      hasMore: false,
    };
    const result = globalSearchUtils.prioritizeCurrentProject({
      group,
      currentProjectId: 'p1',
    });
    expect(result.items.map((entry) => entry.id)).toEqual(['b', 'a', 'c']);
  });

  it('merges extra current project items without duplicates and caps the group', () => {
    const group = {
      type: GlobalSearchResultType.WORKFLOW,
      items: [
        workflow('a', 'p2'),
        workflow('b', 'p2'),
        workflow('c', 'p2'),
        workflow('d', 'p2'),
        workflow('e', 'p1'),
      ],
      hasMore: false,
    };
    const result = globalSearchUtils.prioritizeCurrentProject({
      group,
      currentProjectId: 'p1',
      currentProjectItems: [workflow('e', 'p1'), workflow('f', 'p1')],
    });
    expect(result.items.map((entry) => entry.id)).toEqual([
      'e',
      'f',
      'a',
      'b',
      'c',
    ]);
    expect(result.hasMore).toBe(true);
  });

  it('puts the current project first in the project group', () => {
    const group = {
      type: GlobalSearchResultType.PROJECT,
      items: [
        { ...item(GlobalSearchResultType.PROJECT, 'p2'), id: 'p2' },
        { ...item(GlobalSearchResultType.PROJECT, 'p1'), id: 'p1' },
      ],
      hasMore: false,
    };
    expect(
      globalSearchUtils
        .prioritizeCurrentProject({ group, currentProjectId: 'p1' })
        .items.map((entry) => entry.id),
    ).toEqual(['p1', 'p2']);
  });

  it('does not repeat the project name as its own subtitle', () => {
    const rows = globalSearchUtils.toRows({
      group: {
        type: GlobalSearchResultType.PROJECT,
        items: [{ ...item(GlobalSearchResultType.PROJECT, 'p1'), id: 'p1' }],
        hasMore: false,
      },
      query: 'x',
      currentProjectId: 'p1',
    });
    expect(rows[0].projectName).toBeNull();
  });

  it('hides results from modules the member cannot open', () => {
    expect(
      globalSearchUtils.hiddenResultTypes({
        isTenantAdmin: false,
        modules: [TenantModule.BUSINESS_INTEGRATION],
      }),
    ).toEqual([
      GlobalSearchResultType.CONNECTOR,
      GlobalSearchResultType.MCP_SERVER,
      GlobalSearchResultType.MCP_SERVICE,
    ]);
    expect(
      globalSearchUtils.hiddenResultTypes({
        isTenantAdmin: false,
        modules: [TenantModule.BUSINESS_INTEGRATION, TenantModule.MCP_SERVICES],
      }),
    ).not.toContain(GlobalSearchResultType.MCP_SERVICE);
    expect(
      globalSearchUtils.hiddenResultTypes({
        isTenantAdmin: true,
        modules: null,
      }),
    ).toEqual([]);
  });
});
