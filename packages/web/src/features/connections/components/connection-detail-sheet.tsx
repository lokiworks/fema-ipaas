import { isNil } from '@fema-ipaas/core-utils';
import {
  ConnectionPermission,
  ConnectionStatus,
  connectionAccessUtils,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronRight, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { FormattedDate } from '@/components/custom/formatted-date';
import { StatusIconWithText } from '@/components/custom/status-icon-with-text';
import { UserBadge } from '@/components/custom/user-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ConnectionPermissionTag,
  ConnectionScopeCell,
} from '@/features/connections/components/connection-list-cells';
import {
  connectionsMutations,
  connectionsQueries,
} from '@/features/connections/hooks/connections-hooks';
import { connectionUtils } from '@/features/connections/utils/utils';
import {
  ConnectorIconWithConnectorName,
  connectorsHooks,
} from '@/features/connectors';
import { projectCollectionUtils } from '@/features/projects';
import { cn } from '@/lib/utils';

export function ConnectionDetailSheet({
  connectionId,
  onClose,
  onShare,
  onEdit,
  onReconnect,
  onDelete,
  onAccess,
}: {
  connectionId: string | null;
  onClose: () => void;
  onShare: (connectionId: string) => void;
  onEdit: (connectionId: string) => void;
  onReconnect: (connectionId: string) => void;
  onDelete: (connectionId: string) => void;
  onAccess: (connectionId: string) => void;
}) {
  return (
    <Sheet
      open={!isNil(connectionId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="flex flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {connectionId && (
          <ConnectionDetailContent
            connectionId={connectionId}
            onShare={onShare}
            onEdit={onEdit}
            onReconnect={onReconnect}
            onDelete={onDelete}
            onAccess={onAccess}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ConnectionDetailContent({
  connectionId,
  onShare,
  onEdit,
  onReconnect,
  onDelete,
  onAccess,
}: {
  connectionId: string;
  onShare: (connectionId: string) => void;
  onEdit: (connectionId: string) => void;
  onReconnect: (connectionId: string) => void;
  onDelete: (connectionId: string) => void;
  onAccess: (connectionId: string) => void;
}) {
  const navigate = useNavigate();
  const { data: detail } = connectionsQueries.useConnectionDetail({
    connectionId,
  });
  const { data: myProjects } = projectCollectionUtils.useAll();
  const { summary } = connectorsHooks.useConnectorSummary({
    name: detail?.connectorName ?? '',
  });
  const { mutate: remindOwner, isPending: isReminding } =
    connectionsMutations.useRemindConnectionOwner();

  if (isNil(detail)) {
    return null;
  }

  const manage = connectionAccessUtils.canManage(detail.myPermission);
  const mcpServiceCount =
    detail.references.mcpServices.length +
    detail.references.hiddenMcpServiceCount;
  const projectConfigCount =
    detail.references.projectConfigs.length +
    detail.references.hiddenProjectConfigCount;
  const isActive = detail.status === ConnectionStatus.ACTIVE;
  const myProjectIds = new Set(myProjects.map((project) => project.id));
  const { icon: StatusIcon, variant } = connectionUtils.getStatusIcon(
    detail.status,
  );

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <ConnectorIconWithConnectorName
            connectorName={detail.connectorName}
            size="md"
            showTooltip={false}
          />
          <div className="flex min-w-0 flex-col">
            <SheetTitle className="truncate">{detail.displayName}</SheetTitle>
            <SheetDescription className="truncate">
              {summary?.displayName ?? detail.connectorName} ·{' '}
              {connectionUtils.getAuthTypeLabel(detail.type)}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <ScrollArea viewPortClassName="flex-1">
        <div className="flex flex-col gap-6 px-4 pb-4">
          {!isActive && (
            <Alert variant="warning">
              <AlertTitle>
                {connectionUtils.getBrokenReason(detail.status)}
              </AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                {manage ? (
                  <Button size="sm" onClick={() => onReconnect(connectionId)}>
                    {t('Reconnect')}
                  </Button>
                ) : (
                  <>
                    <span>
                      {t(
                        'You can only use this connection. Ask the owner or an editor to reconnect it.',
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={isReminding}
                      onClick={() => remindOwner(connectionId)}
                    >
                      {t('Remind the owner to reconnect')}
                    </Button>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">{t('Basic Info')}</h4>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t('Status')}</dt>
              <dd>
                <StatusIconWithText
                  icon={StatusIcon}
                  text={connectionUtils.getStatusLabel(detail.status)}
                  variant={variant}
                />
              </dd>
              <dt className="text-muted-foreground">{t('Account')}</dt>
              <dd className="truncate font-mono text-xs">
                {connectionUtils.getConnectionAccountIdentifier(detail) ?? '-'}
              </dd>
              <dt className="text-muted-foreground">
                {t('Available Projects')}
              </dt>
              <dd>
                <ConnectionScopeCell
                  allProjects={detail.allProjects}
                  projects={detail.projects}
                />
              </dd>
              <dt className="text-muted-foreground">{t('Owner')}</dt>
              <dd>
                <UserBadge
                  id={detail.ownerId ?? null}
                  size="small"
                  includeName
                />
              </dd>
              <dt className="text-muted-foreground">{t('My Permission')}</dt>
              <dd>
                <ConnectionPermissionTag permission={detail.myPermission} />
              </dd>
              <dt className="text-muted-foreground">{t('Created')}</dt>
              <dd>
                <FormattedDate date={new Date(detail.created)} />
              </dd>
              <dt className="text-muted-foreground">{t('Connected At')}</dt>
              <dd>
                <FormattedDate date={new Date(detail.updated)} />
              </dd>
            </dl>
            {manage && (
              <Button
                variant="link"
                className="h-auto w-fit p-0"
                onClick={() => onAccess(connectionId)}
              >
                {t('Manage available projects')}
              </Button>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">
              {t('References')} (
              {detail.references.workflows.length +
                detail.references.hiddenWorkflowCount}
              )
            </h4>
            {detail.references.workflows.length === 0 &&
            detail.references.hiddenWorkflowCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('No workflows are using this connection yet')}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {detail.references.workflows.map((workflow) => {
                  const allowed = myProjectIds.has(workflow.projectId);
                  return (
                    <button
                      key={workflow.workflowId}
                      type="button"
                      disabled={!allowed}
                      onClick={() =>
                        allowed &&
                        navigate(
                          `/projects/${workflow.projectId}/workflows/${workflow.workflowId}`,
                        )
                      }
                      className={cn(
                        'flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                        {
                          'cursor-not-allowed opacity-60 hover:bg-transparent':
                            !allowed,
                        },
                      )}
                    >
                      <Workflow className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {workflow.displayName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {allowed
                          ? workflow.projectDisplayName
                          : t("You're not a member of this project")}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            )}
            {(mcpServiceCount > 0 ||
              projectConfigCount > 0 ||
              detail.references.hiddenWorkflowCount > 0) && (
              <p className="text-xs text-muted-foreground">
                {[
                  detail.references.hiddenWorkflowCount > 0 &&
                    t('and {count} more workflows you cannot view', {
                      count: detail.references.hiddenWorkflowCount,
                    }),
                  mcpServiceCount > 0 &&
                    t('{count} MCP services use it as a fixed connection', {
                      count: mcpServiceCount,
                    }),
                  projectConfigCount > 0 &&
                    t('{count} project configs reference it', {
                      count: projectConfigCount,
                    }),
                ]
                  .filter(Boolean)
                  .join('; ')}
              </p>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                {t('Shared With')} ({detail.shareCount})
              </h4>
              {manage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onShare(connectionId)}
                >
                  {t('Manage Sharing')}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <UserBadge id={detail.ownerId ?? null} size="small" includeName />
              <span className="text-xs text-muted-foreground">
                {t('Owner')}
              </span>
            </div>
            {!manage && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'You can only use this connection. Editing, sharing and reconnecting requires the owner to grant the "Can Edit" permission.',
                )}
              </p>
            )}
          </section>
        </div>
      </ScrollArea>
      <SheetFooter className="flex-row justify-between border-t pt-4">
        <div>
          {detail.myPermission === ConnectionPermission.OWNER && (
            <Button
              variant="destructive"
              onClick={() => onDelete(connectionId)}
            >
              {t('Delete')}
            </Button>
          )}
        </div>
        {manage && (
          <Button onClick={() => onEdit(connectionId)}>
            {t('Edit Connection')}
          </Button>
        )}
      </SheetFooter>
    </>
  );
}
