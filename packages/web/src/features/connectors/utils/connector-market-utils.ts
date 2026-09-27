import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk';
import { ConnectorCategory, ConnectorSource } from '@fema-ipaas/shared';
import semver from 'semver';

const CATEGORY_GROUP_BY_CONNECTOR_CATEGORY: Partial<
  Record<ConnectorCategory, MarketCategoryValue>
> = {
  [ConnectorCategory.PRODUCTIVITY]: 'office',
  [ConnectorCategory.FORMS_AND_SURVEYS]: 'office',
  [ConnectorCategory.HUMAN_RESOURCES]: 'hr',
  [ConnectorCategory.CUSTOMER_SUPPORT]: 'crm',
  [ConnectorCategory.SALES_AND_CRM]: 'crm',
  [ConnectorCategory.ACCOUNTING]: 'erp',
  [ConnectorCategory.PAYMENT_PROCESSING]: 'erp',
  [ConnectorCategory.DEVELOPER_TOOLS]: 'dev',
  [ConnectorCategory.COMMERCE]: 'ecommerce',
  [ConnectorCategory.BUSINESS_INTELLIGENCE]: 'database',
  [ConnectorCategory.CONTENT_AND_FILES]: 'storage',
  [ConnectorCategory.ARTIFICIAL_INTELLIGENCE]: 'ai',
  [ConnectorCategory.UNIVERSAL_AI]: 'ai',
  [ConnectorCategory.MARKETING]: 'marketing',
  [ConnectorCategory.COMMUNICATION]: 'marketing',
  [ConnectorCategory.CORE]: 'builtin',
  [ConnectorCategory.WORKFLOW_CONTROL]: 'builtin',
};

function groupsOf(
  connector: Pick<ConnectorMetadataModelSummary, 'categories' | 'source'>,
): MarketCategoryValue[] {
  const fromCategories = (connector.categories ?? [])
    .map((category) => CATEGORY_GROUP_BY_CONNECTOR_CATEGORY[category])
    .filter((value): value is MarketCategoryValue => value !== undefined);
  const groups =
    connector.source === ConnectorSource.PRIVATE
      ? [...fromCategories, 'custom' as const]
      : fromCategories;
  return groups.length > 0 ? Array.from(new Set(groups)) : ['builtin'];
}

function matchesCategory({
  connector,
  category,
}: {
  connector: Pick<ConnectorMetadataModelSummary, 'categories' | 'source'>;
  category: MarketCategoryValue;
}): boolean {
  if (category === 'all') {
    return true;
  }
  return groupsOf(connector).includes(category);
}

function countByCategory(
  connectors: Pick<ConnectorMetadataModelSummary, 'categories' | 'source'>[],
): Record<MarketCategoryValue, number> {
  const counts: Record<MarketCategoryValue, number> = {
    all: 0,
    office: 0,
    hr: 0,
    crm: 0,
    erp: 0,
    dev: 0,
    ecommerce: 0,
    database: 0,
    storage: 0,
    ai: 0,
    marketing: 0,
    builtin: 0,
    custom: 0,
  };
  for (const connector of connectors) {
    counts.all += 1;
    for (const group of groupsOf(connector)) {
      counts[group] += 1;
    }
  }
  return counts;
}

function isOfficialSource(source: ConnectorSource): boolean {
  return (
    source === ConnectorSource.BUILT_IN || source === ConnectorSource.OFFICIAL
  );
}

function matchesKind({
  connector,
  kind,
}: {
  connector: Pick<
    ConnectorMetadataModelSummary,
    'source' | 'actions' | 'triggers'
  >;
  kind: MarketKindFilter;
}): boolean {
  switch (kind) {
    case 'all':
      return true;
    case 'official':
      return isOfficialSource(connector.source);
    case 'community':
      return !isOfficialSource(connector.source);
    case 'trigger':
      return connector.triggers > 0;
  }
}

function normalizeVersion(version: string): string {
  return semver.valid(version) ? version : '0.0.0';
}

function sortConnectors<
  T extends Pick<ConnectorMetadataModelSummary, 'name' | 'version'>,
>({
  connectors,
  sort,
  tenantWorkflowCountByConnectorName,
}: {
  connectors: T[];
  sort: MarketSort;
  tenantWorkflowCountByConnectorName: Record<string, number>;
}): T[] {
  const withIndex = connectors.map((connector, index) => ({
    connector,
    index,
  }));
  withIndex.sort((a, b) => {
    if (sort === 'hot') {
      const diff =
        (tenantWorkflowCountByConnectorName[b.connector.name] ?? 0) -
        (tenantWorkflowCountByConnectorName[a.connector.name] ?? 0);
      return diff !== 0 ? diff : a.index - b.index;
    }
    const diff = semver.compare(
      normalizeVersion(b.connector.version),
      normalizeVersion(a.connector.version),
    );
    return diff !== 0 ? diff : a.index - b.index;
  });
  return withIndex.map(({ connector }) => connector);
}

function isMarketKindFilter(value: string): value is MarketKindFilter {
  return (
    value === 'all' ||
    value === 'official' ||
    value === 'community' ||
    value === 'trigger'
  );
}

function isMarketSort(value: string): value is MarketSort {
  return value === 'hot' || value === 'new';
}

export const connectorMarketUtils = {
  groupsOf,
  matchesCategory,
  countByCategory,
  matchesKind,
  sortConnectors,
  isMarketKindFilter,
  isMarketSort,
};

export const MARKET_CATEGORIES = [
  { value: 'all', label: 'All', icon: 'LayoutGrid' },
  { value: 'office', label: 'Office & Collaboration', icon: 'Users' },
  { value: 'hr', label: 'Human Resources', icon: 'IdCard' },
  { value: 'crm', label: 'Customer Management', icon: 'Handshake' },
  { value: 'erp', label: 'Finance & ERP', icon: 'Landmark' },
  { value: 'dev', label: 'Developer Tools', icon: 'Code' },
  { value: 'ecommerce', label: 'Ecommerce & Retail', icon: 'ShoppingBag' },
  { value: 'database', label: 'Databases', icon: 'Database' },
  { value: 'storage', label: 'File Storage', icon: 'HardDrive' },
  { value: 'ai', label: 'AI Models', icon: 'Sparkles' },
  { value: 'marketing', label: 'Marketing & Messaging', icon: 'Megaphone' },
  { value: 'builtin', label: 'Built-in Tools', icon: 'Wrench' },
  { value: 'custom', label: 'Custom', icon: 'Blocks' },
] as const;

export type MarketCategoryValue = (typeof MARKET_CATEGORIES)[number]['value'];

export type MarketKindFilter = 'all' | 'official' | 'community' | 'trigger';

export type MarketSort = 'hot' | 'new';
