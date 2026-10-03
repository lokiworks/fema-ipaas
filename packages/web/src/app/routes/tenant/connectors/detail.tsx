import {
  ActionBase,
  OutputSchemaField,
  PropertyType,
  TriggerBase,
} from '@fema-ipaas/connector-sdk';
import { isNil } from '@fema-ipaas/core-utils';
import { ConnectorSource } from '@fema-ipaas/shared';
import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  ChevronRightIcon,
  LayoutTemplateIcon,
  LinkIcon,
  PackageXIcon,
  ServerIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { CreateOrEditConnectionDialog } from '@/app/connections/create-edit-connection-dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { connectionsQueries } from '@/features/connections';
import { connectorUsageHooks } from '@/features/connector-usage';
import { ConnectorIcon, connectorsHooks } from '@/features/connectors';
import { connectorMarketUtils } from '@/features/connectors/utils/connector-market-utils';
import { templatesApi } from '@/features/templates';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

export default function ConnectorDetailPage() {
  const params = useParams<{ connectorName: string }>();
  const connectorName = decodeURIComponent(params.connectorName ?? '');
  const navigate = useNavigate();
  const [tab, setTab] = useState<'actions' | 'triggers' | 'versions'>(
    'actions',
  );
  const [connectOpen, setConnectOpen] = useState(false);

  const { connectorModel, isLoading, isNotFound } =
    connectorsHooks.useConnector({
      name: connectorName,
    });
  const { connectors: allConnectors } = connectorsHooks.useConnectors({});
  const { byConnectorName } = connectorUsageHooks.useConnectorUsageSummary();
  const { data: workflowUsage } =
    connectorUsageHooks.useConnectorWorkflowUsage(connectorName);
  const { data: accessibleConnections } =
    connectionsQueries.useAccessibleConnections({
      request: { connectorName, limit: 20 },
      extraKeys: [connectorName],
    });
  const { data: relatedTemplatesPage } = useQuery({
    queryKey: ['connector-related-templates', connectorName],
    queryFn: () => templatesApi.list({ connectors: [connectorName] }),
    enabled: connectorName.length > 0,
  });
  const relatedTemplates = relatedTemplatesPage?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isNotFound || isNil(connectorModel)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageXIcon />
          </EmptyMedia>
          <EmptyTitle>{t('This connector is not available')}</EmptyTitle>
          <EmptyDescription>
            {t('The link may be broken, or the connector has been removed.')}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => navigate('/tenant/connectors')}>
            {t('Back to the connector marketplace')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const usage = byConnectorName[connectorName];
  const actions = Object.values(connectorModel.actions);
  const triggers = Object.values(connectorModel.triggers);
  const authList = isNil(connectorModel.auth)
    ? []
    : Array.isArray(connectorModel.auth)
    ? connectorModel.auth
    : [connectorModel.auth];
  const relatedConnectors = (allConnectors ?? [])
    .filter(
      (candidate) =>
        candidate.name !== connectorModel.name &&
        connectorMarketUtils
          .groupsOf(candidate)
          .some((group) =>
            connectorMarketUtils.groupsOf(connectorModel).includes(group),
          ),
    )
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4 rounded-lg border p-4">
        <ConnectorIcon
          logoUrl={connectorModel.logoUrl}
          displayName={connectorModel.displayName}
          showTooltip={false}
          size="lg"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">
              {connectorModel.displayName}
            </h1>
            <SourceTag source={connectorModel.source} />
          </div>
          <p className="text-sm text-muted-foreground">
            {connectorModel.description || t('No description')}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {connectorModel.source === ConnectorSource.BUILT_IN
                ? t('Built-in connector, upgraded with the platform')
                : t('Current version {version}', {
                    version: connectorModel.version,
                  })}
            </span>
            <span>
              {t('Authentication: {auth}', {
                auth:
                  authList.length > 0
                    ? authList.map((auth) => auth.displayName).join(' / ')
                    : t('None required'),
              })}
            </span>
            {actions.length > 0 && (
              <span>{t('{count} actions', { count: actions.length })}</span>
            )}
            {triggers.length > 0 && (
              <span>{t('{count} triggers', { count: triggers.length })}</span>
            )}
            <span>
              {t('{count} workflows in your projects use it', {
                count: usage?.myWorkflowCount ?? 0,
              })}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {!isNil(connectorModel.auth) && (
            <Button onClick={() => setConnectOpen(true)}>
              <LinkIcon className="mr-1 size-4" />
              {t('New connection')}
            </Button>
          )}
          {actions.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                navigate(
                  `${authenticationSession.appendProjectRoutePrefix(
                    '/mcp-services',
                  )}?newTool=connector&connector=${encodeURIComponent(
                    connectorModel.name,
                  )}`,
                )
              }
            >
              <ServerIcon className="mr-1 size-4" />
              {t('Open up as an MCP tool')}
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Tabs
            value={tab}
            onValueChange={(value) => {
              if (
                value === 'actions' ||
                value === 'triggers' ||
                value === 'versions'
              ) {
                setTab(value);
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="actions">
                {t('Action parameters')} ({actions.length})
              </TabsTrigger>
              <TabsTrigger value="triggers">
                {t('Trigger parameters')} ({triggers.length})
              </TabsTrigger>
              <TabsTrigger value="versions">{t('Version history')}</TabsTrigger>
            </TabsList>
            <TabsContent value="actions">
              <OpList
                ops={actions}
                emptyTitle={t('This connector has no actions')}
                emptyDescription={t(
                  'It only provides triggers to start a workflow.',
                )}
              />
            </TabsContent>
            <TabsContent value="triggers">
              <OpList
                ops={triggers}
                emptyTitle={t('This connector has no triggers')}
                emptyDescription={t(
                  'Use a schedule or webhook trigger to start the workflow, then call this connector in a later step.',
                )}
              />
            </TabsContent>
            <TabsContent value="versions">
              <VersionTab connectorModel={connectorModel} />
            </TabsContent>
          </Tabs>
        </div>
        <aside className="flex flex-col gap-4">
          <SideCard title={t('My connections')}>
            {isNil(connectorModel.auth) ? (
              <p className="text-xs text-muted-foreground">
                {t('No authentication needed; use it directly in workflows.')}
              </p>
            ) : (accessibleConnections?.data.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('No connections to {name} yet.', {
                  name: connectorModel.displayName,
                })}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {accessibleConnections?.data.map((connection) => (
                  <button
                    key={connection.id}
                    type="button"
                    className="flex items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted"
                    onClick={() =>
                      navigate(
                        `${authenticationSession.appendProjectRoutePrefix(
                          '/connections',
                        )}?id=${connection.id}`,
                      )
                    }
                  >
                    <span className="min-w-0 grow truncate">
                      {connection.displayName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </SideCard>
          <SideCard title={t('Used in these workflows')}>
            {(workflowUsage?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('No workflows in your projects use it yet.')}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {workflowUsage?.slice(0, 6).map((workflow) => (
                  <button
                    key={workflow.workflowId}
                    type="button"
                    className="flex items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted"
                    onClick={() =>
                      navigate(
                        authenticationSession.appendProjectRoutePrefix(
                          `/workflows/${workflow.workflowId}`,
                        ),
                      )
                    }
                  >
                    <TextWithTooltip tooltipMessage={workflow.displayName}>
                      <p className="min-w-0 grow truncate">
                        {workflow.displayName}
                      </p>
                    </TextWithTooltip>
                  </button>
                ))}
                {(workflowUsage?.length ?? 0) > 6 && (
                  <p className="px-1 text-xs text-muted-foreground">
                    {t('and {count} more workflows', {
                      count: (workflowUsage?.length ?? 0) - 6,
                    })}
                  </p>
                )}
              </div>
            )}
          </SideCard>
          <SideCard title={t('Related templates')}>
            {relatedTemplates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('No templates use it yet.')}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {relatedTemplates.slice(0, 3).map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="flex items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => navigate('/templates')}
                  >
                    <LayoutTemplateIcon className="size-4 text-muted-foreground" />
                    <span className="min-w-0 grow truncate">
                      {template.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </SideCard>
          {relatedConnectors.length > 0 && (
            <SideCard title={t('Similar connectors')}>
              <div className="flex flex-col gap-1">
                {relatedConnectors.map((related) => (
                  <button
                    key={related.name}
                    type="button"
                    className="flex items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted"
                    onClick={() =>
                      navigate(
                        `/tenant/connectors/detail/${encodeURIComponent(
                          related.name,
                        )}`,
                      )
                    }
                  >
                    <ConnectorIcon
                      logoUrl={related.logoUrl}
                      displayName={related.displayName}
                      showTooltip={false}
                      size="xs"
                    />
                    <span className="min-w-0 grow truncate">
                      {related.displayName}
                    </span>
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </SideCard>
          )}
        </aside>
      </div>
      <CreateOrEditConnectionDialog
        key={connectOpen ? 'open' : 'closed'}
        connector={connectorModel}
        open={connectOpen}
        isGlobalConnection={false}
        reconnectConnection={null}
        setOpen={(open) => setConnectOpen(open)}
      />
    </div>
  );
}

function SourceTag({ source }: { source: ConnectorSource }) {
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

function SideCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

function OpList({
  ops,
  emptyTitle,
  emptyDescription,
}: {
  ops: (ActionBase | TriggerBase)[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  const [search, setSearch] = useState('');
  if (ops.length === 0) {
    return (
      <Empty className="mt-4">
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const needle = search.trim().toLowerCase();
  const shown = ops.filter(
    (op) =>
      !needle ||
      `${op.displayName} ${op.name} ${op.description}`
        .toLowerCase()
        .includes(needle),
  );
  return (
    <div className="mt-4 flex flex-col gap-3">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('Search')}
        className="max-w-xs"
      />
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('No match for "{query}"', { query: search })}
        </p>
      ) : (
        shown.map((op) => <OpBlock key={op.name} op={op} />)
      )}
    </div>
  );
}

function OpBlock({ op }: { op: ActionBase | TriggerBase }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRightIcon
          className={cn(
            'size-4 shrink-0 transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="font-medium">{op.displayName}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {op.name}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t p-3">
          {op.description && (
            <p className="text-sm text-muted-foreground">{op.description}</p>
          )}
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              {t('Input parameters')}
            </div>
            <InputSchemaTable props={op.props} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              {t('Output')}
            </div>
            {op.outputSchema && op.outputSchema.fields.length > 0 ? (
              <OutputSchemaTable fields={op.outputSchema.fields} />
            ) : (
              <p className="text-xs text-muted-foreground">{t('No output')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InputSchemaTable({ props }: { props: ActionBase['props'] }) {
  const entries = Object.entries(props);
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('No input parameters defined')}
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1 pr-2">{t('Field')}</th>
          <th className="py-1 pr-2">{t('Type')}</th>
          <th className="py-1 pr-2">{t('Required')}</th>
          <th className="py-1">{t('Description')}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, property]) => (
          <tr key={key} className="border-t">
            <td className="py-1 pr-2 font-mono text-xs">{key}</td>
            <td className="py-1 pr-2 text-xs">
              {propertyTypeLabel(property.type)}
            </td>
            <td className="py-1 pr-2 text-xs">
              {property.required ? t('Yes') : t('No')}
            </td>
            <td className="py-1 text-xs text-muted-foreground">
              {property.description || property.displayName}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OutputSchemaTable({ fields }: { fields: OutputSchemaField[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1 pr-2">{t('Field')}</th>
          <th className="py-1">{t('Description')}</th>
        </tr>
      </thead>
      <tbody>{fields.flatMap((field) => outputRows(field, 0))}</tbody>
    </table>
  );
}

function outputRows(
  field: OutputSchemaField,
  depth: number,
): React.ReactNode[] {
  const children = field.children ?? field.listItems ?? [];
  const row = (
    <tr key={`${field.key}-${depth}`} className="border-t">
      <td
        className="py-1 pr-2 font-mono text-xs"
        style={{ paddingLeft: depth * 16 }}
      >
        {field.key}
      </td>
      <td className="py-1 text-xs text-muted-foreground">
        {field.description ?? field.label ?? '-'}
      </td>
    </tr>
  );
  return [row, ...children.flatMap((child) => outputRows(child, depth + 1))];
}

function propertyTypeLabel(type: PropertyType): string {
  switch (type) {
    case PropertyType.SHORT_TEXT:
    case PropertyType.LONG_TEXT:
    case PropertyType.RICH_TEXT:
    case PropertyType.MARKDOWN:
    case PropertyType.SECRET_TEXT:
      return t('Text');
    case PropertyType.NUMBER:
      return t('Number');
    case PropertyType.CHECKBOX:
      return t('Yes/No');
    case PropertyType.DROPDOWN:
    case PropertyType.STATIC_DROPDOWN:
      return t('Dropdown');
    case PropertyType.MULTI_SELECT_DROPDOWN:
    case PropertyType.STATIC_MULTI_SELECT_DROPDOWN:
      return t('Multi-select');
    case PropertyType.ARRAY:
      return t('List');
    case PropertyType.OBJECT:
    case PropertyType.JSON:
      return t('Object');
    case PropertyType.DATE_TIME:
      return t('Date and time');
    case PropertyType.DATE_RANGE:
      return t('Date range');
    case PropertyType.FILE:
      return t('File');
    case PropertyType.COLOR:
      return t('Color');
    default:
      return t('Other');
  }
}

function VersionTab({
  connectorModel,
}: {
  connectorModel: { source: ConnectorSource; version: string };
}) {
  if (connectorModel.source === ConnectorSource.BUILT_IN) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        {t(
          'Built-in connectors are upgraded together with the platform; there is nothing to update separately.',
        )}
      </p>
    );
  }
  return (
    <div className="mt-4 flex items-center gap-2 text-sm">
      <Badge>{t('Current version')}</Badge>
      <span className="font-mono">{connectorModel.version}</span>
    </div>
  );
}
