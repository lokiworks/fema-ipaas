import { McpService, McpServiceStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { FolderKanban, Server, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { UserBadge } from '@/components/custom/user-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { authenticationSession } from '@/lib/authentication-session';
import { cn } from '@/lib/utils';

import { mcpServicesHooks } from '../hooks/mcp-services-hooks';

function McpServiceCard({
  service,
  currentProjectId,
}: {
  service: McpService;
  currentProjectId: string;
}) {
  const projectName = service.projectDisplayName ?? t('Unknown project');
  const navigate = useNavigate();
  const status = statusInfo(service.status);
  return (
    <div className="flex flex-col rounded-md border hover:border-primary">
      <button
        type="button"
        onClick={() =>
          navigate(
            authenticationSession.appendProjectRoutePrefix(
              `/mcp-services/${service.id}`,
            ),
          )
        }
        className="flex flex-1 flex-col gap-2 p-4 text-left"
      >
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Server className="size-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <TextWithTooltip tooltipMessage={service.name}>
              <p className="truncate text-sm font-semibold">{service.name}</p>
            </TextWithTooltip>
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="outline">{t('Enterprise custom')}</Badge>
              <Badge variant={status.variant}>{status.label}</Badge>
              {service.listed && <Badge variant="info">{t('Listed')}</Badge>}
            </div>
          </div>
        </div>
        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {service.description}
        </p>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <FolderKanban className="size-3.5 shrink-0" />
          <TextWithTooltip tooltipMessage={projectName}>
            <span
              className={cn(
                'truncate',
                service.projectId !== currentProjectId && 'text-foreground',
              )}
            >
              {service.projectId === currentProjectId
                ? t('Project: {name} (this project)', { name: projectName })
                : t('Project: {name}', { name: projectName })}
            </span>
          </TextWithTooltip>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {t('{count, plural, =0 {No tools} =1 {1 tool} other {# tools}}', {
              count: service.tools.length,
            })}
          </span>
          <span>
            {t('{count} calls in the last 7 days', { count: service.calls7d })}
          </span>
          <span className="flex-1" />
          {service.ownerId ? (
            <UserBadge id={service.ownerId} size="xsmall" includeAvatar />
          ) : (
            <span>{t('Platform maintained')}</span>
          )}
        </div>
      </button>
      {service.canEdit && <McpListingAction service={service} />}
    </div>
  );
}

function McpListingAction({ service }: { service: McpService }) {
  const { mutate: setListed, isPending } = mcpServicesHooks.useSetListed(
    service.id,
  );
  const published = service.releases.length > 0;
  const button = (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto gap-1 px-0"
      disabled={!published || isPending}
      data-testid="mcp-card-listing"
      onClick={() => setListed({ listed: !service.listed })}
    >
      <Store className="size-3.5" />
      {service.listed
        ? t('Remove from the MCP marketplace')
        : t('List on the MCP marketplace')}
    </Button>
  );
  return (
    <div className="flex items-center border-t px-4 py-2">
      {published ? (
        button
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex">
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t('Publish the service first, then list it on the marketplace.')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function statusInfo(status: McpServiceStatus): {
  label: string;
  variant: 'success' | 'secondary' | 'outline';
} {
  switch (status) {
    case McpServiceStatus.ENABLED:
      return { label: t('Enabled'), variant: 'success' };
    case McpServiceStatus.PAUSED:
      return { label: t('Paused'), variant: 'secondary' };
    case McpServiceStatus.DRAFT:
      return { label: t('Not yet published'), variant: 'outline' };
  }
}

export { McpServiceCard, statusInfo as mcpServiceStatusInfo };
