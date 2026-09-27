import { McpServer, McpServerStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ServerIcon } from 'lucide-react';

import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { mcpServerAccessUtils } from '@/features/mcp-servers/utils/mcp-server-access-utils';

export function McpServerCard({
  server,
  onClick,
}: {
  server: McpServer;
  onClick: () => void;
}) {
  const connected = server.status === McpServerStatus.CONNECTED;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <ServerIcon className="size-5" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-medium">
            {server.displayName}
          </span>
          <div className="flex items-center gap-1">
            <Badge variant="outline">{t('MCP')}</Badge>
            <Badge variant={connected ? 'success' : 'destructive'}>
              {connected ? t('Connected') : t('Connection error')}
            </Badge>
          </div>
        </div>
      </div>
      <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
        {server.description || t('No description')}
      </p>
      <div className="min-w-0">
        <TextWithTooltip tooltipMessage={server.url}>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {server.url}
          </p>
        </TextWithTooltip>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{t('{count} tools', { count: server.tools.length })}</span>
        <span>{t('Owner {name}', { name: server.ownerName ?? '-' })}</span>
        <span className="grow" />
        <span>{mcpServerAccessUtils.scopeText({ server })}</span>
      </div>
    </button>
  );
}
