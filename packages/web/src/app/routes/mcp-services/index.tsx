import { Permission } from '@fema-ipaas/core-utils';
import {
  McpService,
  McpServiceListTab,
  TenantModule,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Plus, SearchX, Server, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ConsolePage } from '@/components/custom/console-page';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  McpAddToServiceDialog,
  McpCreateServiceDialog,
  McpServiceCard,
  mcpServicesHooks,
} from '@/features/mcp-services';
import { ModuleGate } from '@/features/tenant-access';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';

type ListTab = 'ALL' | 'MINE' | 'OBTAINED' | 'MARKETPLACE';

function McpServicesPage() {
  return (
    <ModuleGate module={TenantModule.MCP_SERVICES}>
      <McpServicesContent />
    </ModuleGate>
  );
}

function McpServicesContent() {
  const projectId = authenticationSession.getProjectId() ?? '';
  const navigate = useNavigate();
  const { checkAccess } = useAuthorization();
  const canWrite = checkAccess(Permission.WRITE_MCP_SERVICE);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<ListTab>('ALL');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingConnector, setPendingConnector] = useState<{
    connectorName: string;
    actionName: string;
  } | null>(null);
  const [creatingForConnector, setCreatingForConnector] = useState<{
    connectorName: string;
    actionName: string;
  } | null>(null);

  const { data: services, isLoading: isServicesLoading } =
    mcpServicesHooks.useServices({
      projectId,
      tab: McpServiceListTab.ALL,
      search: '',
    });
  const { data: marketplace, isLoading: isMarketplaceLoading } =
    mcpServicesHooks.useServices({
      projectId,
      tab: McpServiceListTab.MARKETPLACE,
      search: '',
      enabled: tab === 'MARKETPLACE',
    });
  const isLoading =
    tab === 'MARKETPLACE' ? isMarketplaceLoading : isServicesLoading;

  useEffect(() => {
    const newTool = searchParams.get('newTool');
    const connectorName = searchParams.get('connector');
    const actionName = searchParams.get('action');
    if (newTool === 'connector' && connectorName && actionName) {
      setPendingConnector({ connectorName, actionName });
      searchParams.delete('newTool');
      searchParams.delete('connector');
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = services ?? [];
  const marketplaceServices = marketplace ?? [];
  const query = search.trim().toLowerCase();
  const matchesQuery = (service: McpService) =>
    !query ||
    `${service.name}${service.key ?? ''}${service.description}`
      .toLowerCase()
      .includes(query);
  const matchesTab = ({
    service,
    tabKey,
  }: {
    service: McpService;
    tabKey: ListTab;
  }) => {
    if (tabKey === 'MARKETPLACE') return true;
    if (tabKey === 'OBTAINED') return service.obtained && !service.canEdit;
    if (service.projectId !== projectId) return false;
    if (tabKey === 'MINE') return service.canEdit;
    return true;
  };
  const searched = all.filter(matchesQuery);
  const counts = {
    ALL: searched.filter((service) => matchesTab({ service, tabKey: 'ALL' }))
      .length,
    MINE: searched.filter((service) => matchesTab({ service, tabKey: 'MINE' }))
      .length,
    OBTAINED: searched.filter((service) =>
      matchesTab({ service, tabKey: 'OBTAINED' }),
    ).length,
  };
  const list =
    tab === 'MARKETPLACE'
      ? marketplaceServices.filter(matchesQuery)
      : searched.filter((service) => matchesTab({ service, tabKey: tab }));

  const myEditableServices = all.filter(
    (service) => service.canEdit && service.projectId === projectId,
  );

  return (
    <ConsolePage
      title={t('MCP services')}
      description={t(
        'Package connector actions and published workflows into MCP services that AI assistants like Claude and Cursor can call directly.',
      )}
      actions={
        <PermissionNeededTooltip hasPermission={canWrite}>
          <Button
            size="sm"
            disabled={!canWrite}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4 mr-1" />
            {t('Create MCP service')}
          </Button>
        </PermissionNeededTooltip>
      }
    >
      <div className="flex items-center justify-between gap-4">
        <Tabs value={tab} onValueChange={(value) => setTab(value as ListTab)}>
          <TabsList>
            <TabsTrigger value="ALL">
              {t('All services ({count})', { count: counts.ALL })}
            </TabsTrigger>
            <TabsTrigger value="MINE">
              {t('Developed by me ({count})', { count: counts.MINE })}
            </TabsTrigger>
            <TabsTrigger value="OBTAINED">
              {t('Obtained by me ({count})', { count: counts.OBTAINED })}
            </TabsTrigger>
            <TabsTrigger value="MARKETPLACE">
              {t('Enterprise MCP marketplace')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Search by name, key or description')}
          className="max-w-64"
        />
      </div>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {!isLoading && list.length === 0 && (
        <Empty>
          {query ? (
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>{t('No matching services')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'No service has a name, key or description containing "{query}"',
                  {
                    query: search.trim(),
                  },
                )}
              </EmptyDescription>
            </EmptyHeader>
          ) : tab === 'MARKETPLACE' ? (
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Store />
              </EmptyMedia>
              <EmptyTitle>{t('Nothing is listed on the marketplace yet')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'Services that any project lists on the enterprise MCP marketplace appear here, so you can obtain them.',
                )}
              </EmptyDescription>
            </EmptyHeader>
          ) : tab === 'OBTAINED' ? (
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Server />
              </EmptyMedia>
              <EmptyTitle>{t('No services obtained yet')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'Open a service in the enterprise MCP marketplace tab and click Obtain to start using it in your AI assistant.',
                )}
              </EmptyDescription>
            </EmptyHeader>
          ) : (
            <>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Server />
                </EmptyMedia>
                <EmptyTitle>{t('No MCP services yet')}</EmptyTitle>
                <EmptyDescription>
                  {t(
                    'Package a connector action or a published workflow into a service that AI assistants can call.',
                  )}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <PermissionNeededTooltip hasPermission={canWrite}>
                  <Button
                    disabled={!canWrite}
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="size-4 mr-1" />
                    {t('Create MCP service')}
                  </Button>
                </PermissionNeededTooltip>
              </EmptyContent>
            </>
          )}
        </Empty>
      )}
      {!isLoading && list.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((service) => (
            <McpServiceCard
              key={service.id}
              service={service}
              currentProjectId={projectId}
            />
          ))}
          {!query && (tab === 'ALL' || tab === 'MINE') && (
            <PermissionNeededTooltip hasPermission={canWrite}>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => setCreateOpen(true)}
                className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-5" />
                {t('Create MCP service')}
              </button>
            </PermissionNeededTooltip>
          )}
        </div>
      )}
      <McpCreateServiceDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreatingForConnector(null);
          }
        }}
        onCreated={(service: McpService) => {
          const target = creatingForConnector;
          setCreatingForConnector(null);
          const suffix = target
            ? `?newTool=connector&connector=${encodeURIComponent(
                target.connectorName,
              )}&action=${encodeURIComponent(target.actionName)}`
            : '';
          navigate(
            authenticationSession.appendProjectRoutePrefix(
              `/mcp-services/${service.id}${suffix}`,
            ),
          );
        }}
      />
      {pendingConnector && (
        <McpAddToServiceDialog
          connectorName={pendingConnector.connectorName}
          actionName={pendingConnector.actionName}
          services={myEditableServices}
          onClose={() => setPendingConnector(null)}
          onPickExisting={(serviceId) => {
            const { connectorName, actionName } = pendingConnector;
            setPendingConnector(null);
            navigate(
              authenticationSession.appendProjectRoutePrefix(
                `/mcp-services/${serviceId}?newTool=connector&connector=${encodeURIComponent(
                  connectorName,
                )}&action=${encodeURIComponent(actionName)}`,
              ),
            );
          }}
          onCreateNew={() => {
            setCreatingForConnector(pendingConnector);
            setPendingConnector(null);
            setCreateOpen(true);
          }}
        />
      )}
    </ConsolePage>
  );
}

export { McpServicesPage };
