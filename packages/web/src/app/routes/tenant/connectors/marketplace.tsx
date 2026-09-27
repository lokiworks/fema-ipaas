import { ConnectorMetadataModelSummary } from '@fema-ipaas/connector-sdk';
import { ConnectorSource, McpServer } from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  BlocksIcon,
  CodeIcon,
  DatabaseIcon,
  FlameIcon,
  HandshakeIcon,
  HardDriveIcon,
  IdCardIcon,
  LandmarkIcon,
  LayoutGridIcon,
  LucideIcon,
  MegaphoneIcon,
  MessageSquarePlusIcon,
  SearchXIcon,
  ServerIcon,
  ServerOffIcon,
  ShoppingBagIcon,
  SparklesIcon,
  UsersIcon,
  WrenchIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounce } from 'use-debounce';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConnectorRequestDialog } from '@/features/connector-demands';
import { connectorUsageHooks } from '@/features/connector-usage';
import { ConnectorIcon, connectorsHooks } from '@/features/connectors';
import {
  connectorMarketUtils,
  MARKET_CATEGORIES,
  MarketCategoryValue,
  MarketKindFilter,
  MarketSort,
} from '@/features/connectors/utils/connector-market-utils';
import {
  McpServerCard,
  McpServerDialog,
  mcpServerAccessUtils,
  mcpServersHooks,
} from '@/features/mcp-servers';
import {
  projectDirectoryHooks,
  projectDirectoryUtils,
} from '@/features/projects/api/project-directory-api';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';

const CATEGORY_ICONS: Record<MarketCategoryValue, LucideIcon> = {
  all: LayoutGridIcon,
  office: UsersIcon,
  hr: IdCardIcon,
  crm: HandshakeIcon,
  erp: LandmarkIcon,
  dev: CodeIcon,
  ecommerce: ShoppingBagIcon,
  database: DatabaseIcon,
  storage: HardDriveIcon,
  ai: SparklesIcon,
  marketing: MegaphoneIcon,
  builtin: WrenchIcon,
  custom: BlocksIcon,
};

const MCP_CATEGORY = 'mcp';
const EMPTY_CONNECTORS: ConnectorMetadataModelSummary[] = [];
const EMPTY_SERVERS: McpServer[] = [];

export default function ConnectorMarketplacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [kind, setKind] = useState<MarketKindFilter>('all');
  const [sort, setSort] = useState<MarketSort>('hot');
  const [requesting, setRequesting] = useState(false);
  const [addingServer, setAddingServer] = useState(false);
  const category = categoryFrom(searchParams.get('cat'));
  const setCategory = (value: string) => {
    setSearchParams((params) => {
      params.set('cat', value);
      return params;
    });
  };

  const { connectors, isLoading: isLoadingConnectors } =
    connectorsHooks.useConnectors({
      searchQuery: debouncedSearch,
      includeHidden: true,
      isTableQuery: true,
      skipProjectFilter: true,
    });
  const { data: servers, isLoading: isLoadingServers } =
    mcpServersHooks.useMcpServers({
      search: debouncedSearch,
      primary: true,
    });
  const { byConnectorName: usageByConnectorName } =
    connectorUsageHooks.useConnectorUsageSummary();
  const { data: directory } = projectDirectoryHooks.useDirectory();
  const isTenantAdmin = useIsTenantAdmin();
  const editableProjectCount = (directory ?? []).filter(
    projectDirectoryUtils.canEdit,
  ).length;
  const addServerDisabledReason = mcpServerAccessUtils.addServerDisabledReason({
    isTenantAdmin,
    editableProjectCount,
  });

  const allConnectors = connectors ?? EMPTY_CONNECTORS;
  const allServers = servers ?? EMPTY_SERVERS;
  const counts = useMemo(
    () => connectorMarketUtils.countByCategory(allConnectors),
    [allConnectors],
  );
  const tenantWorkflowCountByConnectorName = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(usageByConnectorName ?? {}).map(([name, entry]) => [
          name,
          entry.tenantWorkflowCount,
        ]),
      ),
    [usageByConnectorName],
  );

  const connectorCategory: MarketCategoryValue =
    category === MCP_CATEGORY ? 'all' : category;
  const filteredConnectors = useMemo(() => {
    if (category === MCP_CATEGORY) {
      return [];
    }
    const matching = allConnectors.filter(
      (connector) =>
        connectorMarketUtils.matchesCategory({
          connector,
          category: connectorCategory,
        }) && connectorMarketUtils.matchesKind({ connector, kind }),
    );
    return connectorMarketUtils.sortConnectors({
      connectors: matching,
      sort,
      tenantWorkflowCountByConnectorName,
    });
  }, [
    allConnectors,
    category,
    connectorCategory,
    kind,
    sort,
    tenantWorkflowCountByConnectorName,
  ]);

  const showMcpSectionInAll =
    category === 'all' && (kind === 'all' || kind === 'community');

  const noResults =
    category !== MCP_CATEGORY &&
    filteredConnectors.length === 0 &&
    (!showMcpSectionInAll || allServers.length === 0);

  return (
    <div className="flex w-full flex-col gap-4">
      <ConnectorMarketplaceHeader
        category={category}
        addServerDisabledReason={addServerDisabledReason}
        onRequest={() => setRequesting(true)}
        onAddServer={() => setAddingServer(true)}
      />
      <div className="flex min-h-0 flex-1 gap-4">
        <nav
          aria-label={t('Connector categories')}
          className="flex w-52 shrink-0 flex-col gap-1"
        >
          {MARKET_CATEGORIES.map((item) => (
            <CategoryNavButton
              key={item.value}
              icon={CATEGORY_ICONS[item.value]}
              label={t(item.label)}
              count={counts[item.value] ?? 0}
              active={category === item.value}
              onClick={() => setCategory(item.value)}
            />
          ))}
          <div className="my-1 border-t" />
          <CategoryNavButton
            icon={ServerIcon}
            label={t('MCP servers')}
            count={allServers.length}
            active={category === MCP_CATEGORY}
            onClick={() => setCategory(MCP_CATEGORY)}
          />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {category === MCP_CATEGORY ? (
            <McpServerSection
              servers={allServers}
              isLoading={isLoadingServers}
              search={search}
              setSearch={setSearch}
              addServerDisabledReason={addServerDisabledReason}
              onAddServer={() => setAddingServer(true)}
              onOpen={(server) =>
                navigate(`/tenant/connectors/mcp/${server.id}`)
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('Search connectors, actions or triggers')}
                  className="max-w-xs"
                />
                <Tabs
                  value={kind}
                  onValueChange={(value) => {
                    if (connectorMarketUtils.isMarketKindFilter(value)) {
                      setKind(value);
                    }
                  }}
                >
                  <TabsList>
                    <TabsTrigger value="all">{t('All')}</TabsTrigger>
                    <TabsTrigger value="official">{t('Official')}</TabsTrigger>
                    <TabsTrigger value="community">
                      {t('Community & custom')}
                    </TabsTrigger>
                    <TabsTrigger value="trigger">
                      {t('Supports triggers')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <span className="grow" />
                <span className="text-xs text-muted-foreground">
                  {t('{count} connectors', {
                    count: filteredConnectors.length,
                  })}
                </span>
                <Select
                  value={sort}
                  onValueChange={(value) => {
                    if (connectorMarketUtils.isMarketSort(value)) {
                      setSort(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hot">{t('Hottest')}</SelectItem>
                    <SelectItem value="new">{t('Newest')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isLoadingConnectors ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-32 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  {filteredConnectors.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredConnectors.map((connector) => (
                        <ConnectorCard
                          key={`${connector.name}@${connector.version}`}
                          connector={connector}
                          hotCount={
                            tenantWorkflowCountByConnectorName[
                              connector.name
                            ] ?? 0
                          }
                          onClick={() =>
                            navigate(
                              `/tenant/connectors/detail/${encodeURIComponent(
                                connector.name,
                              )}`,
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                  {noResults && (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <SearchXIcon />
                        </EmptyMedia>
                        <EmptyTitle>
                          {t('No matching connectors found')}
                        </EmptyTitle>
                        <EmptyDescription>
                          {t(
                            'You can ask the tenant admins for a new connector.',
                          )}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button onClick={() => setRequesting(true)}>
                          {t('Request a connector')}
                        </Button>
                      </EmptyContent>
                    </Empty>
                  )}
                  {showMcpSectionInAll && allServers.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {t('MCP servers')}
                        </span>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() => setCategory(MCP_CATEGORY)}
                        >
                          {t('View all')}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {allServers.map((server) => (
                          <McpServerCard
                            key={server.id}
                            server={server}
                            onClick={() =>
                              navigate(`/tenant/connectors/mcp/${server.id}`)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <ConnectorRequestDialog
        open={requesting}
        onOpenChange={setRequesting}
        presetCapability={search.trim()}
      />
      <McpServerDialog
        open={addingServer}
        onOpenChange={setAddingServer}
        onSaved={(server) => navigate(`/tenant/connectors/mcp/${server.id}`)}
      />
    </div>
  );
}

function ConnectorMarketplaceHeader({
  category,
  addServerDisabledReason,
  onRequest,
  onAddServer,
}: {
  category: string;
  addServerDisabledReason: string | null;
  onRequest: () => void;
  onAddServer: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold">{t('Connector Marketplace')}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'Connectors wrap third-party APIs into actions and triggers you can use in workflows; actions can also be opened up as MCP tools.',
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" onClick={onRequest}>
          <MessageSquarePlusIcon className="mr-1 size-4" />
          {t('Request a connector')}
        </Button>
        {category !== MCP_CATEGORY && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={addServerDisabledReason ? 0 : undefined}>
                <Button
                  disabled={Boolean(addServerDisabledReason)}
                  onClick={onAddServer}
                >
                  <ServerIcon className="mr-1 size-4" />
                  {t('Add an MCP server')}
                </Button>
              </span>
            </TooltipTrigger>
            {addServerDisabledReason && (
              <TooltipContent>{addServerDisabledReason}</TooltipContent>
            )}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function CategoryNavButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-left text-sm font-medium'
          : 'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60'
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="grow truncate">{label}</span>
      <span className="text-xs">{count}</span>
    </button>
  );
}

function ConnectorCard({
  connector,
  hotCount,
  onClick,
}: {
  connector: ConnectorMetadataModelSummary;
  hotCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted"
    >
      <div className="flex items-center gap-3">
        <ConnectorIcon
          logoUrl={connector.logoUrl}
          displayName={connector.displayName}
          showTooltip={false}
          size="md"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-medium">
            {connector.displayName}
          </span>
          <div className="flex items-center gap-1">
            <SourceBadge source={connector.source} />
            {connector.source !== ConnectorSource.BUILT_IN && (
              <span className="text-xs text-muted-foreground">
                {connector.version}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
        {connector.description || t('No description')}
      </p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {connector.actions > 0 && (
          <span>{t('{count} actions', { count: connector.actions })}</span>
        )}
        {connector.triggers > 0 && (
          <span>{t('{count} triggers', { count: connector.triggers })}</span>
        )}
        <span className="grow" />
        {hotCount > 0 && (
          <span
            className="flex items-center gap-1"
            title={t('Usage in this tenant')}
          >
            <FlameIcon className="size-3" />
            {hotCount}
          </span>
        )}
      </div>
    </button>
  );
}

function SourceBadge({ source }: { source: ConnectorSource }) {
  switch (source) {
    case ConnectorSource.BUILT_IN:
      return <Badge variant="outline">{t('Built-in')}</Badge>;
    case ConnectorSource.OFFICIAL:
      return <Badge variant="outline">{t('Official')}</Badge>;
    case ConnectorSource.PRIVATE:
      return <Badge variant="secondary">{t('Custom')}</Badge>;
    case ConnectorSource.COMMUNITY:
      return <Badge variant="outline">{t('Community')}</Badge>;
  }
}

function McpServerSection({
  servers,
  isLoading,
  search,
  setSearch,
  addServerDisabledReason,
  onAddServer,
  onOpen,
}: {
  servers: McpServer[];
  isLoading: boolean;
  search: string;
  setSearch: (value: string) => void;
  addServerDisabledReason: string | null;
  onAddServer: () => void;
  onOpen: (server: McpServer) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Search MCP servers, addresses or tools')}
          className="max-w-xs"
        />
        <span className="grow" />
        <span className="text-xs text-muted-foreground">
          {t('{count} MCP servers', { count: servers.length })}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={addServerDisabledReason ? 0 : undefined}>
              <Button
                disabled={Boolean(addServerDisabledReason)}
                onClick={onAddServer}
              >
                <ServerIcon className="mr-1 size-4" />
                {t('Add an MCP server')}
              </Button>
            </span>
          </TooltipTrigger>
          {addServerDisabledReason && (
            <TooltipContent>{addServerDisabledReason}</TooltipContent>
          )}
        </Tooltip>
      </div>
      <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        {t(
          'Bring in MCP servers your company already runs, without writing a connector for them: their tools can be used as actions in workflows, or handed to an AI agent. Connection tests and tool calls are both made by the worker.',
        )}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      ) : servers.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <McpServerCard
              key={server.id}
              server={server}
              onClick={() => onOpen(server)}
            />
          ))}
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {search.trim() ? <SearchXIcon /> : <ServerOffIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {search.trim()
                ? t('No matching MCP servers found')
                : t('No MCP servers connected yet')}
            </EmptyTitle>
            <EmptyDescription>
              {search.trim()
                ? t('Try a different search term.')
                : t(
                    'Fill in the server address and authentication; once the connection test passes, its tools are ready to use in workflows and agents.',
                  )}
            </EmptyDescription>
          </EmptyHeader>
          {!search.trim() && (
            <EmptyContent>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={addServerDisabledReason ? 0 : undefined}>
                    <Button
                      disabled={Boolean(addServerDisabledReason)}
                      onClick={onAddServer}
                    >
                      {t('Add an MCP server')}
                    </Button>
                  </span>
                </TooltipTrigger>
                {addServerDisabledReason && (
                  <TooltipContent>{addServerDisabledReason}</TooltipContent>
                )}
              </Tooltip>
            </EmptyContent>
          )}
        </Empty>
      )}
    </div>
  );
}

function categoryFrom(
  value: string | null,
): MarketCategoryValue | typeof MCP_CATEGORY {
  if (value === MCP_CATEGORY) {
    return MCP_CATEGORY;
  }
  const match = MARKET_CATEGORIES.find((category) => category.value === value);
  return match ? match.value : 'all';
}
