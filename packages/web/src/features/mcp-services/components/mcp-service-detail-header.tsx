import {
  McpService,
  McpServiceIssue,
  McpServiceStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import {
  ArrowRightLeft,
  Bug,
  Check,
  CircleMinus,
  CirclePlay,
  Download,
  MoreHorizontal,
  PenLine,
  Store,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { UserBadge } from '@/components/custom/user-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { authenticationSession } from '@/lib/authentication-session';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

import { McpDeleteServiceDialog } from './mcp-delete-service-dialog';
import { McpIssuesPopover } from './mcp-issues-popover';
import { mcpServiceStatusInfo } from './mcp-service-card';
import { McpEditInfoDialog } from './mcp-service-info-dialog';
import { McpTransferDialog } from './mcp-transfer-dialog';

function McpServiceDetailHeader({
  service,
  issues,
  canPublish,
  onDebug,
  onPublish,
  onIssuePick,
}: {
  service: McpService;
  issues: McpServiceIssue[];
  canPublish: boolean;
  onDebug: () => void;
  onPublish: () => void;
  onIssuePick: (issue: McpServiceIssue) => void;
}) {
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const status = mcpServiceStatusInfo(service.status);
  const { mutate: setStatus } = mcpServicesHooks.useSetStatus(service.id);
  const { mutate: setListed } = mcpServicesHooks.useSetListed(service.id);
  const { mutate: obtain, isPending: obtaining } = mcpServicesHooks.useObtain(
    service.id,
  );
  const publishBlockedReason =
    service.tools.length === 0
      ? t('Add a tool before publishing')
      : service.releases.length > 0 && !service.draftChanged
      ? t('No changes to publish')
      : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{service.name}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            {service.draftChanged && service.releases.length > 0 && (
              <Badge variant="secondary">{t('Unpublished changes')}</Badge>
            )}
            {service.listed && <Badge variant="info">{t('Listed')}</Badge>}
            {service.legacy && <Badge variant="outline">{t('Legacy')}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{service.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {service.key && <span className="font-mono">{service.key}</span>}
            <span>
              {t('{count, plural, =0 {No tools} =1 {1 tool} other {# tools}}', {
                count: service.tools.length,
              })}
            </span>
            <span>
              {t('{count} calls in the last 7 days', {
                count: service.calls7d,
              })}
            </span>
            {service.ownerId && (
              <span className="flex items-center gap-1">
                {t('Owner')}
                <UserBadge
                  id={service.ownerId}
                  size="xsmall"
                  includeAvatar
                  includeName
                />
              </span>
            )}
          </div>
        </div>
        {service.canEdit && (
          <div className="flex shrink-0 items-center gap-2">
            <McpIssuesPopover issues={issues} onPick={onIssuePick} />
            <Button type="button" variant="outline" size="sm" onClick={onDebug}>
              <Bug className="size-4 mr-1" />
              {t('Debug')}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={Boolean(publishBlockedReason) || !canPublish}
                    onClick={onPublish}
                  >
                    <UploadCloud className="size-4 mr-1" />
                    {t('Publish')}
                  </Button>
                </span>
              </TooltipTrigger>
              {publishBlockedReason && (
                <TooltipContent>{publishBlockedReason}</TooltipContent>
              )}
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <PenLine className="size-4" />
                  {t('Edit service info')}
                </DropdownMenuItem>
                {service.status === McpServiceStatus.ENABLED ? (
                  <DropdownMenuItem
                    onClick={() =>
                      setStatus({ status: McpServiceStatus.PAUSED })
                    }
                  >
                    <CircleMinus className="size-4" />
                    {t('Pause service')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={service.releases.length === 0}
                    onClick={() =>
                      setStatus({ status: McpServiceStatus.ENABLED })
                    }
                  >
                    <CirclePlay className="size-4" />
                    {t('Enable service')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={service.releases.length === 0}
                  onClick={() => setListed({ listed: !service.listed })}
                >
                  <Store className="size-4" />
                  {service.listed
                    ? t('Remove from the MCP marketplace')
                    : t('List on the MCP marketplace')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                  <ArrowRightLeft className="size-4" />
                  {t('Transfer ownership')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  {t('Delete service')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {!service.canEdit && (
          <Button
            type="button"
            size="sm"
            disabled={service.obtained || obtaining}
            onClick={() => obtain()}
          >
            {service.obtained ? (
              <Check className="size-4 mr-1" />
            ) : (
              <Download className="size-4 mr-1" />
            )}
            {service.obtained ? t('Obtained') : t('Obtain')}
          </Button>
        )}
      </div>
      {!service.canEdit && (
        <Alert>
          <AlertDescription>
            {service.ownerName
              ? t(
                  'This service is developed and maintained by {owner}. You can view its tools and usage; contact the owner to make changes.',
                  { owner: service.ownerName },
                )
              : t(
                  'You can view this service and its usage; contact the owner to make changes.',
                )}
          </AlertDescription>
        </Alert>
      )}
      <McpEditInfoDialog
        service={service}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <McpTransferDialog
        service={service}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
      <McpDeleteServiceDialog
        service={service}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() =>
          navigate(
            authenticationSession.appendProjectRoutePrefix('/mcp-services'),
          )
        }
      />
    </div>
  );
}

export { McpServiceDetailHeader };
