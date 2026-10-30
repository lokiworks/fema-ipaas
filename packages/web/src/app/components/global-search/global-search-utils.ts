import {
  GLOBAL_SEARCH_GROUP_LIMIT,
  GlobalSearchGroup,
  GlobalSearchItem,
  GlobalSearchResultType,
  IssueKind,
  IssueStatus,
  TenantModule,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { issueUiUtils } from '@/features/issues/utils/issue-ui-utils';

function itemHref({
  item,
  currentProjectId,
}: {
  item: GlobalSearchItem;
  currentProjectId: string;
}): string {
  const projectId = item.projectId ?? currentProjectId;
  switch (item.type) {
    case GlobalSearchResultType.WORKFLOW:
      return `/projects/${projectId}/workflows/${item.id}`;
    case GlobalSearchResultType.PROJECT:
      return `/projects/${item.id}/home`;
    case GlobalSearchResultType.CONNECTION:
      return `/projects/${currentProjectId}/connections?id=${encodeURIComponent(
        item.id,
      )}`;
    case GlobalSearchResultType.CONNECTOR:
      return `/tenant/connectors/detail/${encodeURIComponent(item.id)}`;
    case GlobalSearchResultType.MCP_SERVICE:
      return `/projects/${projectId}/mcp-services/${item.id}`;
    case GlobalSearchResultType.TEMPLATE:
      return `/templates?search=${encodeURIComponent(item.label)}`;
    case GlobalSearchResultType.DATA_STORE:
      return `/projects/${projectId}/data-stores?id=${item.id}`;
    case GlobalSearchResultType.ISSUE:
      return `/projects/${projectId}/issues/${item.id}`;
    case GlobalSearchResultType.MAPPING_TABLE:
      return `/projects/${projectId}/mapping-tables?id=${item.id}`;
    case GlobalSearchResultType.MCP_SERVER:
      return `/tenant/connectors/mcp/${item.id}`;
  }
}

function viewAllHref({
  type,
  query,
  currentProjectId,
}: {
  type: GlobalSearchResultType;
  query: string;
  currentProjectId: string;
}): string {
  const search = encodeURIComponent(query);
  switch (type) {
    case GlobalSearchResultType.WORKFLOW:
      return `/projects/${currentProjectId}/home`;
    case GlobalSearchResultType.PROJECT:
      return '/projects';
    case GlobalSearchResultType.CONNECTION:
      return `/projects/${currentProjectId}/connections?search=${search}`;
    case GlobalSearchResultType.CONNECTOR:
    case GlobalSearchResultType.MCP_SERVER:
      return '/tenant/connectors';
    case GlobalSearchResultType.MCP_SERVICE:
      return `/projects/${currentProjectId}/mcp-services`;
    case GlobalSearchResultType.TEMPLATE:
      return `/templates?search=${search}`;
    case GlobalSearchResultType.DATA_STORE:
      return `/projects/${currentProjectId}/data-stores`;
    case GlobalSearchResultType.ISSUE:
      return `/projects/${currentProjectId}/issues?search=${search}`;
    case GlobalSearchResultType.MAPPING_TABLE:
      return `/projects/${currentProjectId}/mapping-tables`;
  }
}

function groupHeading(type: GlobalSearchResultType): string {
  switch (type) {
    case GlobalSearchResultType.WORKFLOW:
      return t('Workflows');
    case GlobalSearchResultType.PROJECT:
      return t('Projects');
    case GlobalSearchResultType.CONNECTION:
      return t('Connections');
    case GlobalSearchResultType.CONNECTOR:
      return t('Connectors');
    case GlobalSearchResultType.MCP_SERVICE:
      return t('MCP services');
    case GlobalSearchResultType.TEMPLATE:
      return t('Templates');
    case GlobalSearchResultType.DATA_STORE:
      return t('Data stores');
    case GlobalSearchResultType.ISSUE:
      return t('Issues');
    case GlobalSearchResultType.MAPPING_TABLE:
      return t('Mapping tables');
    case GlobalSearchResultType.MCP_SERVER:
      return t('MCP servers');
  }
}

function toRows({
  group,
  query,
  currentProjectId,
}: {
  group: GlobalSearchGroup;
  query: string;
  currentProjectId: string;
}): GlobalSearchRow[] {
  const rows: GlobalSearchRow[] = group.items.map((item) => ({
    id: `${group.type}-${item.id}`,
    kind: 'resource',
    resourceType: item.type,
    label: item.label,
    subtitle: item.subtitle ?? null,
    projectName:
      item.type === GlobalSearchResultType.PROJECT
        ? null
        : item.projectName ?? null,
    issueStatus: item.issueStatus ?? null,
    href: itemHref({ item, currentProjectId }),
  }));
  if (!group.hasMore) {
    return rows;
  }
  return [
    ...rows,
    {
      id: `view-all-${group.type}`,
      kind: 'view-all',
      resourceType: group.type,
      label: t('View all'),
      subtitle: null,
      projectName: null,
      issueStatus: null,
      href: viewAllHref({ type: group.type, query, currentProjectId }),
    },
  ];
}

function belongsToProject({
  item,
  projectId,
}: {
  item: GlobalSearchItem;
  projectId: string;
}): boolean {
  return item.type === GlobalSearchResultType.PROJECT
    ? item.id === projectId
    : item.projectId === projectId;
}

function prioritizeCurrentProject({
  group,
  currentProjectId,
  currentProjectItems = [],
}: {
  group: GlobalSearchGroup;
  currentProjectId: string;
  currentProjectItems?: GlobalSearchItem[];
}): GlobalSearchGroup {
  const known = new Set(currentProjectItems.map((item) => item.id));
  const merged = [
    ...currentProjectItems,
    ...group.items.filter((item) => !known.has(item.id)),
  ];
  const current = merged.filter((item) =>
    belongsToProject({ item, projectId: currentProjectId }),
  );
  const others = merged.filter(
    (item) => !belongsToProject({ item, projectId: currentProjectId }),
  );
  const ordered = [...current, ...others];
  return {
    ...group,
    items: ordered.slice(0, GLOBAL_SEARCH_GROUP_LIMIT),
    hasMore: group.hasMore || ordered.length > GLOBAL_SEARCH_GROUP_LIMIT,
  };
}

function displayLabel(row: GlobalSearchRow): string {
  if (
    row.kind === 'resource' &&
    row.resourceType === GlobalSearchResultType.ISSUE
  ) {
    return issueUiUtils.issueTitle({
      kind: IssueKind.STEP,
      title: row.label,
      connectionExternalId: null,
    });
  }
  return row.label;
}

function displaySubtitle({
  row,
  connectorName,
}: {
  row: GlobalSearchRow;
  connectorName: (name: string) => string;
}): string | null {
  if (
    row.kind === 'resource' &&
    row.resourceType === GlobalSearchResultType.CONNECTION &&
    row.subtitle !== null
  ) {
    return connectorName(row.subtitle);
  }
  return row.subtitle;
}

function hiddenResultTypes({
  isTenantAdmin,
  modules,
}: {
  isTenantAdmin: boolean;
  modules: TenantModule[] | null;
}): GlobalSearchResultType[] {
  if (isTenantAdmin) {
    return [];
  }
  const adminOnly = [
    GlobalSearchResultType.CONNECTOR,
    GlobalSearchResultType.MCP_SERVER,
  ];
  if (modules !== null && modules.includes(TenantModule.MCP_SERVICES)) {
    return adminOnly;
  }
  return [...adminOnly, GlobalSearchResultType.MCP_SERVICE];
}

export const globalSearchUtils = {
  hiddenResultTypes,
  prioritizeCurrentProject,
  displayLabel,
  displaySubtitle,
  itemHref,
  viewAllHref,
  groupHeading,
  toRows,
};

export type GlobalSearchRow = {
  id: string;
  kind: 'resource' | 'view-all';
  resourceType: GlobalSearchResultType;
  label: string;
  subtitle: string | null;
  projectName: string | null;
  issueStatus: IssueStatus | null;
  href: string;
};
