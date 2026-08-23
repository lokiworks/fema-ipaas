import { WORKSPACE_COLOR_PALETTE } from '@fema-ipaas/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { t } from 'i18next';

import { useEmbedding } from '@/components/providers/embed-provider';
import { foldersApi } from '@/features/folders';
import { workflowsApi } from '@/features/workflows';
import {
  workspaceCollectionUtils,
  getWorkspaceName,
} from '@/features/workspaces';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

import { getAccessHistory } from './access-history';
import { STATIC_PAGES, type StaticPage } from './static-pages';

const SEARCH_LIMIT = 6;
const SUPPLEMENT_THRESHOLD = 5;

function getTimePeriod(
  timestamp: number,
): 'today' | 'yesterday' | 'last-week' | 'last-30-days' {
  const now = new Date();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDay = new Date(timestamp);
  const itemDayStart = new Date(
    itemDay.getFullYear(),
    itemDay.getMonth(),
    itemDay.getDate(),
  );
  const diffDays = Math.floor(
    (nowDay.getTime() - itemDayStart.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'last-week';
  return 'last-30-days';
}

export function useGlobalSearchResults(query: string, open: boolean) {
  const workspaceId = authenticationSession.getWorkspaceId() ?? '';
  const isTenantAdmin = useIsTenantAdmin();
  const { embedState } = useEmbedding();
  const hideTables = embedState.hideTables;
  const { data: allWorkspaces = [] } = workspaceCollectionUtils.useAll();
  const currentWorkspace = allWorkspaces.find((p) => p.id === workspaceId);
  const currentWorkspaceName = currentWorkspace
    ? getWorkspaceName(currentWorkspace)
    : null;
  const hasQuery = query.length > 0;

  const accessHistory = hideTables
    ? getAccessHistory().filter((h) => h.type !== 'table')
    : getAccessHistory();
  const hasHistory = accessHistory.length > 0;
  const needsSupplement =
    !hasQuery && accessHistory.length < SUPPLEMENT_THRESHOLD;

  const searchEnabled = hasQuery && !!workspaceId;
  const suggestionsEnabled =
    !hasQuery && needsSupplement && open && !!workspaceId;

  const foldersQuery = useQuery({
    queryKey: ['global-search-folders', workspaceId],
    queryFn: () => foldersApi.list(),
    staleTime: 60_000,
    enabled: !!workspaceId && open,
  });

  const folderMap = new Map(
    (foldersQuery.data ?? []).map((f) => [f.id, f.displayName]),
  );

  const workflowsQuery = useQuery({
    queryKey: ['global-search-workflows', workspaceId, query],
    queryFn: () =>
      workflowsApi.list({
        workspaceId,
        ...(hasQuery ? { name: query } : {}),
        limit: SEARCH_LIMIT,
        cursor: undefined,
      }),
    enabled: searchEnabled || suggestionsEnabled,
    staleTime: hasQuery ? 15_000 : 60_000,
    placeholderData: keepPreviousData,
  });

  const matchedPages = STATIC_PAGES.filter(
    (p) =>
      (!p.requiresTenantAdmin || isTenantAdmin) &&
      (!hasQuery || p.label.toLowerCase().includes(query.toLowerCase())),
  ).slice(0, SEARCH_LIMIT);

  const matchedWorkspaces = allWorkspaces
    .filter(
      (p) =>
        !hasQuery || p.displayName.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, SEARCH_LIMIT);

  const allFolders = foldersQuery.data ?? [];
  const matchedFolders = hasQuery
    ? allFolders.filter((f) =>
        f.displayName.toLowerCase().includes(query.toLowerCase()),
      )
    : allFolders;

  const workflowResults: SearchResultItem[] = (
    workflowsQuery.data?.data ?? []
  ).map((workflow) => ({
    id: `workflow-${workflow.id}`,
    type: 'workflow' as const,
    label: workflow.version.displayName,
    href: authenticationSession.appendWorkspaceRoutePrefix(
      `/workflows/${workflow.id}`,
    ),
    folderName: workflow.folderId
      ? folderMap.get(workflow.folderId) ?? null
      : null,
    updated: workflow.updated ? String(workflow.updated) : null,
    status: workflow.status,
    workspaceName: currentWorkspaceName,
  }));

  const tableResults: SearchResultItem[] = [];

  const folderResults: SearchResultItem[] = matchedFolders
    .slice(0, SEARCH_LIMIT)
    .map((folder) => ({
      id: `folder-${folder.id}`,
      type: 'folder' as const,
      label: folder.displayName,
      href:
        authenticationSession.appendWorkspaceRoutePrefix('/automations') +
        `?folder=${folder.id}`,
      workspaceName: currentWorkspaceName,
    }));

  const workspaceResults: SearchResultItem[] = matchedWorkspaces.map(
    (workspace) => {
      const palette = workspace.icon
        ? WORKSPACE_COLOR_PALETTE[workspace.icon.color]
        : null;
      const name = getWorkspaceName(workspace);
      return {
        id: `workspace-${workspace.id}`,
        type: 'workspace' as const,
        label: name,
        href: `/workspaces/${workspace.id}/automations`,
        iconBgColor: palette?.color,
        iconTextColor: palette?.textColor,
        iconLetter: name.charAt(0).toUpperCase(),
      };
    },
  );

  const pageResults: SearchResultItem[] = matchedPages.map((page) => ({
    id: page.id,
    type: 'page' as const,
    label: page.label,
    href: page.href,
    pageIcon: page.icon,
  }));

  const isSearchLoading = workflowsQuery.isLoading && searchEnabled;

  if (!hasQuery) {
    if (hasHistory) {
      const historyIds = new Set(accessHistory.map((h) => h.id));

      type PoolItem = { item: SearchResultItem; timestamp: number };

      const historyPool: PoolItem[] = accessHistory.map((h) => ({
        timestamp: h.accessedAt,
        item: {
          id: h.id,
          type: h.type,
          label: h.label,
          href: h.href,
          status: h.status,
          folderName: h.folderName,
          workspaceName: h.workspaceName,
          iconBgColor: h.iconBgColor,
          iconTextColor: h.iconTextColor,
          iconLetter: h.iconLetter,
          pageIcon:
            h.type === 'page'
              ? STATIC_PAGES.find((p) => p.id === h.id)?.icon
              : undefined,
        },
      }));

      const suggestedItems: SearchResultItem[] = [];

      if (needsSupplement) {
        const remaining = SUPPLEMENT_THRESHOLD - accessHistory.length;
        const fillCandidates: PoolItem[] = [
          ...workflowResults.map((r) => ({
            item: r,
            timestamp: r.updated ? new Date(r.updated).getTime() : 0,
          })),
          ...tableResults.map((r) => ({
            item: r,
            timestamp: r.updated ? new Date(r.updated).getTime() : 0,
          })),
          ...workspaceResults.map((r) => ({ item: r, timestamp: 0 })),
          ...pageResults.map((r) => ({ item: r, timestamp: 0 })),
        ].filter((p) => !historyIds.has(p.item.id));

        suggestedItems.push(
          ...fillCandidates.slice(0, remaining).map((p) => p.item),
        );
      }

      const buckets: Record<string, SearchResultItem[]> = {
        today: [],
        yesterday: [],
        'last-week': [],
        'last-30-days': [],
      };

      for (const { item, timestamp } of historyPool) {
        buckets[getTimePeriod(timestamp)].push(item);
      }

      const periodDefs = [
        { key: 'today', label: t('Today') },
        { key: 'yesterday', label: t('Yesterday') },
        { key: 'last-week', label: t('Last Week') },
        { key: 'last-30-days', label: t('Last 30 Days') },
      ];

      const isFillLoading =
        needsSupplement && workflowsQuery.isLoading && suggestionsEnabled;

      const groups: SearchResultGroup[] = periodDefs
        .filter((p) => buckets[p.key].length > 0)
        .map((p) => ({
          type: `history-${p.key}`,
          heading: p.label,
          items: buckets[p.key],
          isLoading: false,
        }));

      if (suggestedItems.length > 0) {
        groups.push({
          type: 'suggestions',
          heading: t('Suggested'),
          items: suggestedItems,
          isLoading: false,
        });
      }

      if (
        isFillLoading &&
        historyPool.length + suggestedItems.length < SUPPLEMENT_THRESHOLD
      ) {
        groups.push({
          type: 'suggestions-loading',
          heading: '',
          items: [],
          isLoading: true,
        });
      }

      return { groups, isLoading: false };
    }

    const isFallbackLoading = workflowsQuery.isLoading && suggestionsEnabled;
    const flatItems: SearchResultItem[] = [
      ...workflowResults.slice(0, 5),
      ...tableResults.slice(0, 5),
      ...workspaceResults.slice(0, 5),
      ...pageResults.slice(0, 5),
    ];
    return {
      groups:
        isFallbackLoading || flatItems.length > 0
          ? ([
              {
                type: 'suggestions',
                heading: '',
                items: flatItems,
                isLoading: isFallbackLoading,
              },
            ] as SearchResultGroup[])
          : [],
      isLoading: isFallbackLoading,
    };
  }

  const groups: SearchResultGroup[] = [
    {
      type: 'workflow',
      heading: t('Workflows'),
      items: workflowResults,
      isLoading: workflowsQuery.isLoading && searchEnabled,
    },
    {
      type: 'table',
      heading: t('Tables'),
      items: tableResults,
      isLoading: false,
    },
    {
      type: 'folder',
      heading: t('Folders'),
      items: folderResults,
      isLoading: foldersQuery.isLoading && searchEnabled,
    },
    {
      type: 'workspace',
      heading: t('Workspaces'),
      items: workspaceResults,
      isLoading: false,
    },
    {
      type: 'page',
      heading: t('Pages'),
      items: pageResults,
      isLoading: false,
    },
  ].filter((g) => g.isLoading || g.items.length > 0);

  return { groups, isLoading: isSearchLoading };
}

export type SearchResultItem = {
  id: string;
  type: 'workflow' | 'table' | 'folder' | 'workspace' | 'page';
  label: string;
  href: string;
  status?: 'ENABLED' | 'DISABLED' | null;
  folderName?: string | null;
  updated?: string | null;
  iconBgColor?: string;
  iconTextColor?: string;
  iconLetter?: string;
  pageIcon?: StaticPage['icon'];
  workspaceName?: string | null;
};

export type SearchResultGroup = {
  type: string;
  heading: string;
  items: SearchResultItem[];
  isLoading: boolean;
};
