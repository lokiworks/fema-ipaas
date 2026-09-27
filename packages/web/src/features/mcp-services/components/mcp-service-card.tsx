import { McpService, McpServiceStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { Server } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { UserBadge } from '@/components/custom/user-badge';
import { Badge } from '@/components/ui/badge';
import { authenticationSession } from '@/lib/authentication-session';

function McpServiceCard({ service }: { service: McpService }) {
  const navigate = useNavigate();
  const status = statusInfo(service.status);
  return (
    <button
      type="button"
      onClick={() =>
        navigate(
          authenticationSession.appendProjectRoutePrefix(
            `/mcp-services/${service.id}`,
          ),
        )
      }
      className="flex flex-col gap-2 rounded-md border p-4 text-left hover:border-primary"
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
