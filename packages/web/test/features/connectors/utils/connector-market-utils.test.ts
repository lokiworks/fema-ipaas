import { ConnectorCategory, ConnectorSource, ConnectorType, PackageType } from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { connectorMarketUtils } from '@/features/connectors/utils/connector-market-utils';

function connector(overrides: Partial<Parameters<typeof base>[0]> = {}) {
  return base({ ...overrides });
}

function base({
  name = 'connector',
  version = '1.0.0',
  categories = [] as ConnectorCategory[],
  source = ConnectorSource.COMMUNITY,
  actions = 1,
  triggers = 0,
}) {
  return {
    name,
    version,
    categories,
    source,
    actions,
    triggers,
    connectorType: ConnectorType.OFFICIAL,
    packageType: PackageType.REGISTRY,
    projectUsage: 0,
  };
}

describe('connectorMarketUtils', () => {
  it('maps known connector categories to market groups', () => {
    const groups = connectorMarketUtils.groupsOf(
      connector({ categories: [ConnectorCategory.HUMAN_RESOURCES] }),
    );
    expect(groups).toEqual(['hr']);
  });

  it('deduplicates market groups mapped from multiple categories', () => {
    const groups = connectorMarketUtils.groupsOf(
      connector({
        categories: [
          ConnectorCategory.ARTIFICIAL_INTELLIGENCE,
          ConnectorCategory.UNIVERSAL_AI,
        ],
      }),
    );
    expect(groups).toEqual(['ai']);
  });

  it('falls back to builtin when a connector has no mapped category', () => {
    const groups = connectorMarketUtils.groupsOf(connector({ categories: [] }));
    expect(groups).toEqual(['builtin']);
  });

  it('adds the custom group for private connectors', () => {
    const groups = connectorMarketUtils.groupsOf(
      connector({
        categories: [ConnectorCategory.SALES_AND_CRM],
        source: ConnectorSource.PRIVATE,
      }),
    );
    expect(groups).toEqual(['crm', 'custom']);
  });

  it('matches the all category regardless of the connector', () => {
    expect(
      connectorMarketUtils.matchesCategory({
        connector: connector(),
        category: 'all',
      }),
    ).toBe(true);
  });

  it('counts connectors per category including all', () => {
    const counts = connectorMarketUtils.countByCategory([
      connector({ categories: [ConnectorCategory.HUMAN_RESOURCES] }),
      connector({ categories: [ConnectorCategory.SALES_AND_CRM] }),
    ]);
    expect(counts.all).toBe(2);
    expect(counts.hr).toBe(1);
    expect(counts.crm).toBe(1);
    expect(counts.database).toBe(0);
  });

  it('treats built-in and official sources as official', () => {
    expect(
      connectorMarketUtils.matchesKind({
        connector: connector({ source: ConnectorSource.BUILT_IN }),
        kind: 'official',
      }),
    ).toBe(true);
    expect(
      connectorMarketUtils.matchesKind({
        connector: connector({ source: ConnectorSource.COMMUNITY }),
        kind: 'official',
      }),
    ).toBe(false);
  });

  it('treats community and private sources as community', () => {
    expect(
      connectorMarketUtils.matchesKind({
        connector: connector({ source: ConnectorSource.PRIVATE }),
        kind: 'community',
      }),
    ).toBe(true);
  });

  it('filters connectors that support triggers', () => {
    expect(
      connectorMarketUtils.matchesKind({
        connector: connector({ triggers: 0 }),
        kind: 'trigger',
      }),
    ).toBe(false);
    expect(
      connectorMarketUtils.matchesKind({
        connector: connector({ triggers: 2 }),
        kind: 'trigger',
      }),
    ).toBe(true);
  });

  it('sorts by tenant workflow usage when sort is hot', () => {
    const a = connector({ name: 'a' });
    const b = connector({ name: 'b' });
    const sorted = connectorMarketUtils.sortConnectors({
      connectors: [a, b],
      sort: 'hot',
      tenantWorkflowCountByConnectorName: { a: 1, b: 10 },
    });
    expect(sorted.map((c) => c.name)).toEqual(['b', 'a']);
  });

  it('keeps original order for ties when sorting hot', () => {
    const a = connector({ name: 'a' });
    const b = connector({ name: 'b' });
    const sorted = connectorMarketUtils.sortConnectors({
      connectors: [a, b],
      sort: 'hot',
      tenantWorkflowCountByConnectorName: {},
    });
    expect(sorted.map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('sorts by version descending when sort is new', () => {
    const a = connector({ name: 'a', version: '1.0.0' });
    const b = connector({ name: 'b', version: '2.3.1' });
    const sorted = connectorMarketUtils.sortConnectors({
      connectors: [a, b],
      sort: 'new',
      tenantWorkflowCountByConnectorName: {},
    });
    expect(sorted.map((c) => c.name)).toEqual(['b', 'a']);
  });
});
