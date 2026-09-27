import {
  BlueprintConnectorState,
  ConnectorBlueprintListFilter,
  ConnectorBlueprintSummary,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ChevronDownIcon,
  FileJsonIcon,
  PackageCheckIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  TerminalIcon,
  UploadIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { connectorBlueprintHooks } from '@/features/connector-blueprints';
import { NewConnectorDialog } from '@/features/connector-blueprints/components/new-connector-dialog';
import { OpenApiImportDialog } from '@/features/connector-blueprints/components/openapi-import-dialog';
import { useIsTenantAdmin } from '@/hooks/authorization-hooks';
import { cn } from '@/lib/utils';

export default function ConnectorDevelopmentPage() {
  const isTenantAdmin = useIsTenantAdmin();
  const [tab, setTab] = useState<ConnectorBlueprintListFilter>(
    ConnectorBlueprintListFilter.MINE,
  );
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const navigate = useNavigate();

  const mine = connectorBlueprintHooks.useConnectorBlueprints({
    filter: ConnectorBlueprintListFilter.MINE,
  });
  const collaborating = connectorBlueprintHooks.useConnectorBlueprints({
    filter: ConnectorBlueprintListFilter.COLLABORATING,
  });
  const all = connectorBlueprintHooks.useConnectorBlueprints({
    filter: ConnectorBlueprintListFilter.ALL,
    enabled: isTenantAdmin,
  });

  const activeQuery =
    tab === ConnectorBlueprintListFilter.MINE
      ? mine
      : tab === ConnectorBlueprintListFilter.COLLABORATING
      ? collaborating
      : all;

  const search_ = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (activeQuery.data ?? []).filter(
        (blueprint) =>
          search_.length === 0 ||
          `${blueprint.displayName} ${blueprint.identifier} ${blueprint.description}`
            .toLowerCase()
            .includes(search_),
      ),
    [activeQuery.data, search_],
  );

  const existingIdentifiers = useMemo(
    () => [
      ...(mine.data ?? []).map((blueprint) => blueprint.identifier),
      ...(collaborating.data ?? []).map((blueprint) => blueprint.identifier),
    ],
    [mine.data, collaborating.data],
  );

  const hasAnyConnector =
    (mine.data?.length ?? 0) > 0 ||
    (collaborating.data?.length ?? 0) > 0 ||
    (all.data?.length ?? 0) > 0;
  const initialListsLoaded =
    !mine.isLoading &&
    !collaborating.isLoading &&
    (!isTenantAdmin || !all.isLoading);

  const dialogs = (
    <>
      <NewConnectorDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        existingIdentifiers={existingIdentifiers}
      />
      <OpenApiImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );

  if (initialListsLoaded && !hasAnyConnector) {
    return (
      <div className="flex w-full flex-col gap-4 p-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TerminalIcon />
            </EmptyMedia>
            <EmptyTitle>{t('Hi, create your first connector')}</EmptyTitle>
            <EmptyDescription>
              {t(
                'Wrap an internal system or a service without an official connector so it can be used in workflows just like an official connector.',
              )}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button onClick={() => setNewOpen(true)}>
                <PlusIcon className="mr-1 size-4" />
                {t('New connector')}
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileJsonIcon className="mr-1 size-4" />
                {t('Import from OpenAPI')}
              </Button>
            </div>
          </EmptyContent>
        </Empty>
        {dialogs}
        <CliGuideSection />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t('Connector Development')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'Develop connectors for internal systems or services that are not covered yet. Once published they can be used in workflows and MCP services.',
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileJsonIcon className="mr-1 size-4" />
            {t('Import from OpenAPI')}
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <PlusIcon className="mr-1 size-4" />
            {t('New connector')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (isConnectorBlueprintListFilter(value)) {
              setTab(value);
            }
          }}
        >
          <TabsList>
            <TabsTrigger value={ConnectorBlueprintListFilter.MINE}>
              {t('Developed by me')} ({mine.data?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value={ConnectorBlueprintListFilter.COLLABORATING}>
              {t('Collaborating on')} ({collaborating.data?.length ?? 0})
            </TabsTrigger>
            {isTenantAdmin && (
              <TabsTrigger value={ConnectorBlueprintListFilter.ALL}>
                {t('All connectors')} ({all.data?.length ?? 0})
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        <div className="relative w-60">
          <SearchIcon className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Search by name or identifier')}
            className="pl-8"
          />
        </div>
      </div>

      {activeQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyListState
          search={search_}
          tab={tab}
          onNew={() => setNewOpen(true)}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Connector')}</TableHead>
              <TableHead>{t('Identifier')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Operations / Triggers')}</TableHead>
              <TableHead>{t('Owner')}</TableHead>
              <TableHead>{t('Last saved')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((blueprint) => (
              <TableRow
                key={blueprint.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate(
                    `/tenant/connectors/development/${blueprint.id}/basic`,
                  )
                }
              >
                <TableCell className="max-w-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
                      style={{ background: blueprint.iconColor }}
                    >
                      {iconLetterOf(blueprint.displayName)}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <TextWithTooltip tooltipMessage={blueprint.displayName}>
                        <p className="truncate font-medium">
                          {blueprint.displayName}
                        </p>
                      </TextWithTooltip>
                      <TextWithTooltip
                        tooltipMessage={
                          blueprint.description || t('No description yet')
                        }
                      >
                        <p className="truncate text-xs text-muted-foreground">
                          {blueprint.description || t('No description yet')}
                        </p>
                      </TextWithTooltip>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {blueprint.identifier}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <ConnectorStateBadge blueprint={blueprint} />
                    {blueprint.pendingChanges > 0 && (
                      <Badge variant="secondary">
                        {t('Pending publish {count}', {
                          count: blueprint.pendingChanges,
                        })}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {blueprint.operationCount} / {blueprint.triggerCount}
                </TableCell>
                <TableCell className="text-sm">
                  {blueprint.owner?.name ?? t('Deleted user')}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(blueprint.updated).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {dialogs}
      <CliGuideSection />
    </div>
  );
}

function EmptyListState({
  search,
  tab,
  onNew,
}: {
  search: string;
  tab: ConnectorBlueprintListFilter;
  onNew: () => void;
}) {
  if (search.length > 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>{t('No matching connectors')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'Try another keyword. You can search by name, identifier or description',
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (tab === ConnectorBlueprintListFilter.COLLABORATING) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('No connectors under collaboration')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'Connectors show up here once another developer adds you as a developer member',
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t('No connectors developed by you yet')}</EmptyTitle>
        <EmptyDescription>
          {t('Create a connector to bring an internal system into workflows')}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onNew}>
          <PlusIcon className="mr-1 size-4" />
          {t('New connector')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function ConnectorStateBadge({
  blueprint,
}: {
  blueprint: ConnectorBlueprintSummary;
}) {
  switch (blueprint.state) {
    case BlueprintConnectorState.PUBLISHED:
      return (
        <Badge variant="success">
          {t('Published v{version}', {
            version: blueprint.currentVersion ?? '',
          })}
        </Badge>
      );
    case BlueprintConnectorState.OFFLINE:
      return <Badge variant="secondary">{t('Offline')}</Badge>;
    case BlueprintConnectorState.DRAFT:
      return <Badge variant="outline">{t('Draft')}</Badge>;
  }
}

function CliGuideSection() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t pt-4">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('gap-1', open && 'mb-2')}
        >
          <ChevronDownIcon
            className={cn('size-4 transition-transform', !open && '-rotate-90')}
          />
          {t('Prefer to build a connector in code?')}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="mb-3 text-sm text-muted-foreground">
          {t('Build a connector in code and publish it to this instance.')}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {CLI_STEPS.map((step) => (
            <Card key={step.command}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <step.icon className="size-4 text-muted-foreground" />
                  {step.title()}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
                  {step.command}
                </pre>
                <span className="text-xs text-muted-foreground">
                  {step.description()}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function iconLetterOf(name: string): string {
  const character = [...name.trim()][0] ?? '?';
  return /[a-z]/.test(character) ? character.toUpperCase() : character;
}

function isConnectorBlueprintListFilter(
  value: string,
): value is ConnectorBlueprintListFilter {
  return Object.values(ConnectorBlueprintListFilter).some(
    (filter) => filter === value,
  );
}

const CLI_STEPS = [
  {
    icon: PackageIcon,
    title: () => t('Scaffold'),
    command: 'fema connectors create',
    description: () =>
      t(
        'Generates a connector package under packages/connectors with the SDK wired up.',
      ),
  },
  {
    icon: TerminalIcon,
    title: () => t('Add an action or trigger'),
    command: 'fema actions create\nfema triggers create',
    description: () =>
      t(
        'Adds a typed action or trigger file and registers it on the connector.',
      ),
  },
  {
    icon: PackageCheckIcon,
    title: () => t('Validate'),
    command: 'fema connectors validate',
    description: () =>
      t(
        'Checks the packaging rules that only surface after publishing: scoped name, exact version, pinned dependencies.',
      ),
  },
  {
    icon: UploadIcon,
    title: () => t('Pack and publish'),
    command: 'fema connectors pack\nfema connectors publish',
    description: () =>
      t(
        'Builds the bundle, writes the registry manifest, and uploads it to this instance.',
      ),
  },
];
