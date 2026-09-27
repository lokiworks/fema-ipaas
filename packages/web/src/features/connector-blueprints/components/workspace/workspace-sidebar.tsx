import {
  BlueprintChangeKind,
  BlueprintTriggerType,
  ConnectorBlueprintDetail,
} from '@fema-ipaas/shared';
import { useQueryClient } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeXmlIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  GitBranchIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  PlayIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react';
import { ComponentType, ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { connectorBlueprintsApi } from '../../api/connector-blueprints-api';
import {
  CONNECTOR_BLUEPRINTS_KEY,
  connectorBlueprintHooks,
} from '../../hooks/connector-blueprint-hooks';
import { blueprintIconUtils } from '../../utils/blueprint-icon-utils';
import { blueprintWorkspaceUtils } from '../../utils/blueprint-workspace-utils';

import {
  GroupDialog,
  NewOperationDialog,
  NewTriggerDialog,
} from './new-item-dialogs';
import { TransferOwnershipDialog } from './transfer-ownership-dialog';

export function BlueprintWorkspaceSidebar({
  detail,
  section,
  sub,
}: {
  detail: ConnectorBlueprintDetail;
  section: string;
  sub: string | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [operationGroup, setOperationGroup] = useState<string | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState<GroupDialogState | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removeGroup, setRemoveGroup] = useState<string | null>(null);
  const base = `/tenant/connectors/development/${detail.id}`;
  const groups = blueprintWorkspaceUtils.groupsOf(detail.definition);
  const pendingOperations = blueprintWorkspaceUtils.pendingKeys({
    detail,
    kind: BlueprintChangeKind.OPERATION,
  });
  const pendingTriggers = blueprintWorkspaceUtils.pendingKeys({
    detail,
    kind: BlueprintChangeKind.TRIGGER,
  });
  const folders = [
    ...groups.map((group) => `group:${group.name}`),
    ...(detail.definition.triggers.length > 0 ? [TRIGGER_FOLDER] : []),
  ];
  const allCollapsed =
    folders.length > 0 && folders.every((folder) => collapsed.includes(folder));
  const toggle = (folder: string) =>
    setCollapsed((current) =>
      current.includes(folder)
        ? current.filter((entry) => entry !== folder)
        : [...current, folder],
    );
  const { mutate: saveDefinition } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({ id: detail.id });
  const usageText =
    detail.usage.workflows > 0 || detail.usage.connections > 0
      ? t(
          '{workflows} workflows and {connections} connections use it. They will fail after deletion.',
          {
            workflows: detail.usage.workflows,
            connections: detail.usage.connections,
          },
        )
      : t('No workflow or connection uses it right now.');

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r">
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Link
            to="/tenant/connectors/development"
            className="flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3" />
            {t('All connectors')}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={t('Connector actions')}
              >
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => navigate(`${base}/basic`)}>
                <UsersIcon className="size-4" />
                {t('Manage developer members')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!detail.canManage}
                onSelect={() => setTransferOpen(true)}
              >
                <ArrowRightLeftIcon className="size-4" />
                <MenuText
                  label={t('Transfer ownership')}
                  reason={
                    detail.canManage
                      ? null
                      : t('Only the owner and administrators can transfer it')
                  }
                />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!detail.canManage}
                className="text-destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2Icon className="size-4" />
                <MenuText
                  label={t('Delete connector')}
                  reason={
                    detail.canManage
                      ? null
                      : t('Only the owner and administrators can delete it')
                  }
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white"
            style={{ background: detail.iconColor }}
          >
            {blueprintIconUtils.letterOf(detail.displayName)}
          </span>
          <p className="truncate font-medium">{detail.displayName}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('Last saved: {date}', {
            date: new Date(detail.updated).toLocaleString(),
          })}
        </p>
        <nav className="flex flex-col gap-0.5">
          <NavLink
            to={`${base}/basic`}
            active={section === 'basic'}
            icon={FileTextIcon}
            label={t('Basic information')}
            dot={blueprintWorkspaceUtils.basicTodo(detail)}
          />
          <NavLink
            to={`${base}/auth`}
            active={section === 'auth'}
            icon={ShieldCheckIcon}
            label={t('Authentication and authorization')}
            dot={blueprintWorkspaceUtils.authTodo(detail)}
          />
          <NavLink
            to={`${base}/versions`}
            active={section === 'versions'}
            icon={GitBranchIcon}
            label={t('Versions and publishing')}
            count={detail.changes.length}
          />
        </nav>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1 px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">
          <span className="grow">{t('Operations')}</span>
          {folders.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-xs"
              onClick={() => setCollapsed(allCollapsed ? [] : folders)}
            >
              {allCollapsed ? t('Expand all') : t('Collapse all')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={t('New')}
              >
                <PlusIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setOperationGroup('')}>
                <PlayIcon className="size-4" />
                {t('New operation')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTriggerOpen(true)}>
                <ZapIcon className="size-4" />
                {t('New trigger')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setGroupDialog({ from: null })}>
                <FolderPlusIcon className="size-4" />
                {t('New group')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto px-2 pb-3">
          <TreeLink
            to={`${base}/status`}
            active={section === 'status'}
            dot={blueprintWorkspaceUtils.statusPending(detail)}
          >
            <CodeXmlIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{t('Status code configuration')}</span>
          </TreeLink>
          {groups.map((group) => {
            const folder = `group:${group.name}`;
            const open = !collapsed.includes(folder);
            return (
              <div key={folder} className="flex flex-col gap-0.5">
                <div className="group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-accent">
                  <button
                    type="button"
                    className="flex min-w-0 grow items-center gap-1.5 text-left"
                    aria-expanded={open}
                    onClick={() => toggle(folder)}
                  >
                    {open ? (
                      <ChevronDownIcon className="size-3 text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon className="size-3 text-muted-foreground" />
                    )}
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {group.name.length > 0 ? group.name : t('Ungrouped')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.operations.length}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-5"
                        aria-label={t('Group actions')}
                      >
                        <MoreHorizontalIcon className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setOperationGroup(group.name)}
                      >
                        <PlusIcon className="size-4" />
                        {t('New operation in this group')}
                      </DropdownMenuItem>
                      {group.name.length > 0 && (
                        <>
                          <DropdownMenuItem
                            onSelect={() =>
                              setGroupDialog({ from: group.name })
                            }
                          >
                            <PencilLineIcon className="size-4" />
                            {t('Rename group')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() =>
                              group.operations.length === 0
                                ? saveDefinition({
                                    definition:
                                      blueprintWorkspaceUtils.removeGroup({
                                        definition: detail.definition,
                                        name: group.name,
                                      }),
                                  })
                                : setRemoveGroup(group.name)
                            }
                          >
                            <Trash2Icon className="size-4" />
                            {t('Delete group')}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {open && group.operations.length === 0 && (
                  <p className="pl-8 text-xs text-muted-foreground">
                    {t('No operations in this group yet')}
                  </p>
                )}
                {open &&
                  group.operations.map((operation) => (
                    <TreeLink
                      key={operation.key}
                      to={`${base}/op/${operation.key}`}
                      active={section === 'op' && sub === operation.key}
                      dot={pendingOperations.includes(operation.key)}
                      indent
                    >
                      <MethodTag method={operation.method} />
                      <span className="truncate">{operation.name}</span>
                    </TreeLink>
                  ))}
              </div>
            );
          })}
          {detail.definition.triggers.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent"
                aria-expanded={!collapsed.includes(TRIGGER_FOLDER)}
                onClick={() => toggle(TRIGGER_FOLDER)}
              >
                {collapsed.includes(TRIGGER_FOLDER) ? (
                  <ChevronRightIcon className="size-3 text-muted-foreground" />
                ) : (
                  <ChevronDownIcon className="size-3 text-muted-foreground" />
                )}
                <ZapIcon className="size-4 text-muted-foreground" />
                <span className="grow">{t('Triggers')}</span>
                <span className="text-xs text-muted-foreground">
                  {detail.definition.triggers.length}
                </span>
              </button>
              {!collapsed.includes(TRIGGER_FOLDER) &&
                detail.definition.triggers.map((trigger) => (
                  <TreeLink
                    key={trigger.key}
                    to={`${base}/trigger/${trigger.key}`}
                    active={section === 'trigger' && sub === trigger.key}
                    dot={pendingTriggers.includes(trigger.key)}
                    indent
                  >
                    <Badge variant="outline" className="px-1 text-[10px]">
                      {trigger.type === BlueprintTriggerType.INSTANT
                        ? t('Instant')
                        : t('Polling')}
                    </Badge>
                    <span className="truncate">{trigger.name}</span>
                  </TreeLink>
                ))}
            </div>
          )}
          {detail.definition.operations.length === 0 &&
            detail.definition.triggers.length === 0 && (
              <div className="flex flex-col items-start gap-2 px-2 py-3 text-xs text-muted-foreground">
                <p>{t('An operation is one API that workflows can call')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOperationGroup('')}
                >
                  <PlusIcon className="size-3.5" />
                  {t('New operation')}
                </Button>
              </div>
            )}
        </div>
      </div>
      <NewOperationDialog
        detail={detail}
        group={operationGroup ?? ''}
        open={operationGroup !== null}
        onOpenChange={(open) => setOperationGroup(open ? operationGroup : null)}
      />
      <NewTriggerDialog
        detail={detail}
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
      />
      <GroupDialog
        detail={detail}
        from={groupDialog?.from ?? null}
        open={groupDialog !== null}
        onOpenChange={(open) => setGroupDialog(open ? groupDialog : null)}
      />
      <TransferOwnershipDialog
        detail={detail}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
      <ConfirmationDeleteDialog
        title={t('Delete group {name}?', { name: removeGroup ?? '' })}
        message={t(
          'The operations in this group move to Ungrouped. The operations themselves are not deleted.',
        )}
        entityName={removeGroup ?? ''}
        buttonText={t('Delete group')}
        open={removeGroup !== null}
        onOpenChange={(open) => setRemoveGroup(open ? removeGroup : null)}
        mutationFn={async () => {
          if (removeGroup === null) {
            return;
          }
          await connectorBlueprintsApi.update(detail.id, {
            definition: blueprintWorkspaceUtils.removeGroup({
              definition: detail.definition,
              name: removeGroup,
            }),
          });
          await queryClient.invalidateQueries({
            queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'one', detail.id],
          });
        }}
      />
      <ConfirmationDeleteDialog
        title={t('Delete connector {name}?', { name: detail.displayName })}
        message={t('{usage} This cannot be undone.', { usage: usageText })}
        entityName={detail.displayName}
        buttonText={t('Delete connector')}
        isDanger
        showToast
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        mutationFn={async () => {
          await connectorBlueprintsApi.delete(detail.id);
          await queryClient.invalidateQueries({
            queryKey: [CONNECTOR_BLUEPRINTS_KEY, 'list'],
          });
          navigate('/tenant/connectors/development');
        }}
      />
    </aside>
  );
}

function NavLink({
  to,
  active,
  icon: Icon,
  label,
  dot,
  count,
}: {
  to: string;
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  dot?: boolean;
  count?: number;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
        active && 'bg-accent font-medium',
      )}
    >
      <Icon className="size-4 text-muted-foreground" />
      <span className="grow truncate">{label}</span>
      {dot && <span className="size-1.5 rounded-full bg-destructive" />}
      {!!count && <Badge variant="secondary">{count}</Badge>}
    </Link>
  );
}

function TreeLink({
  to,
  active,
  dot,
  indent,
  children,
}: {
  to: string;
  active: boolean;
  dot: boolean;
  indent?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent',
        indent && 'pl-6',
        active && 'bg-accent font-medium',
      )}
    >
      {children}
      {dot && (
        <span
          className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-500"
          title={t('Has unpublished changes')}
        />
      )}
    </Link>
  );
}

function MenuText({ label, reason }: { label: string; reason: string | null }) {
  return (
    <span className="flex flex-col">
      <span>{label}</span>
      {reason && (
        <span className="text-xs text-muted-foreground">{reason}</span>
      )}
    </span>
  );
}

function MethodTag({ method }: { method: string }) {
  return (
    <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] font-semibold text-muted-foreground">
      {method}
    </span>
  );
}

const TRIGGER_FOLDER = 'triggers';

type GroupDialogState = {
  from: string | null;
};
