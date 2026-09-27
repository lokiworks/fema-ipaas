import {
  GlobalSearchGroup,
  GlobalSearchItem,
  GlobalSearchResultType,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

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
      return `/projects/${item.id}/automations`;
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
      return `/projects/${currentProjectId}/automations`;
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
    projectName: item.projectName ?? null,
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
      href: viewAllHref({ type: group.type, query, currentProjectId }),
    },
  ];
}

export const globalSearchUtils = {
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
  href: string;
};
