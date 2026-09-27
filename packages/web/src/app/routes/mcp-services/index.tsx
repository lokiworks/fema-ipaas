import { Permission } from '@fema-ipaas/core-utils';
import { McpService, McpServiceWithToken } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { KeyRound, Pencil, Plus, ServerCog, Trash2 } from 'lucide-react';
import { ReactNode, useState } from 'react';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
import { FormattedDate } from '@/components/custom/formatted-date';
import { PermissionNeededTooltip } from '@/components/custom/permission-needed-tooltip';
import { TextWithTooltip } from '@/components/custom/text-with-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  McpServiceDialog,
  McpTokenDialog,
  mcpServicesHooks,
  mcpServiceUtils,
} from '@/features/mcp-services';
import { useAuthorization } from '@/hooks/authorization-hooks';
import { authenticationSession } from '@/lib/authentication-session';
import { cn, DASHBOARD_CONTENT_PADDING_X } from '@/lib/utils';

function McpServicesPage() {
  const projectId = authenticationSession.getProjectId() ?? '';
  const { checkAccess } = useAuthorization();
  const canWrite = checkAccess(Permission.WRITE_MCP_SERVICE);
  const { data: services, isLoading } =
    mcpServicesHooks.useMcpServices(projectId);
  const { mutateAsync: rotateToken } = mcpServicesHooks.useRotateToken();
  const { mutateAsync: deleteService } = mcpServicesHooks.useDeleteMcpService();
  const endpointFor = mcpServicesHooks.useEndpointUrl();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<McpService | null>(null);
  const [tokenService, setTokenService] = useState<McpServiceWithToken | null>(
    null,
  );
  const [rotating, setRotating] = useState<McpService | null>(null);
  const [deleting, setDeleting] = useState<McpService | null>(null);

  const openDialog = (service: McpService | null) => {
    setEditing(service);
    setDialogOpen(true);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-4 w-full max-w-5xl py-4',
        DASHBOARD_CONTENT_PADDING_X,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-semibold">{t('MCP services')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'Publish workflows as tools that AI assistants such as Claude and Cursor can call. Each service has its own endpoint and token.',
            )}
          </p>
        </div>
        <PermissionNeededTooltip hasPermission={canWrite}>
          <Button
            size="sm"
            disabled={!canWrite}
            onClick={() => openDialog(null)}
          >
            <Plus className="size-4 mr-1" />
            {t('New MCP service')}
          </Button>
        </PermissionNeededTooltip>
      </div>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {!isLoading && (services ?? []).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 py-6">
            <ServerCog className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t('No MCP services yet')}
            </span>
            <span className="text-sm text-muted-foreground">
              {t(
                'Create a service, pick the workflows it exposes, then paste its endpoint and token into your AI assistant. Only published workflows that start with a Webhook trigger can be tools.',
              )}
            </span>
          </CardContent>
        </Card>
      )}
      {(services ?? []).map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          endpoint={endpointFor(service.id)}
          canWrite={canWrite}
          onEdit={() => openDialog(service)}
          onRotate={() => setRotating(service)}
          onDelete={() => setDeleting(service)}
        />
      ))}
      <McpServiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        existing={editing}
        onCreated={setTokenService}
      />
      <McpTokenDialog
        service={tokenService}
        onClose={() => setTokenService(null)}
      />
      <ConfirmationDeleteDialog
        title={t('Rotate token')}
        message={t(
          'A new token is created and the current one stops working right away. Every client using this service must be updated with the new token.',
        )}
        entityName={rotating?.name ?? ''}
        buttonText={t('Rotate token')}
        open={rotating !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRotating(null);
          }
        }}
        mutationFn={async () => {
          if (!rotating) {
            return;
          }
          const rotated = await rotateToken(rotating.id);
          setRotating(null);
          setTokenService(rotated);
        }}
      />
      <ConfirmationDeleteDialog
        title={t('Delete MCP service')}
        message={t(
          'Clients using this service lose access to its tools. The workflows themselves are not changed.',
        )}
        entityName={deleting?.name ?? ''}
        buttonText={t('Delete')}
        isDanger
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        mutationFn={async () => {
          if (!deleting) {
            return;
          }
          await deleteService(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function ServiceCard({
  service,
  endpoint,
  canWrite,
  onEdit,
  onRotate,
  onDelete,
}: {
  service: McpService;
  endpoint: string;
  canWrite: boolean;
  onEdit: () => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <TextWithTooltip tooltipMessage={service.name}>
              <p className="text-sm font-semibold">{service.name}</p>
            </TextWithTooltip>
            <Badge variant={service.enabled ? 'success' : 'outline'}>
              {service.enabled ? t('Enabled') : t('Disabled')}
            </Badge>
          </div>
          {service.description && (
            <CardDescription>{service.description}</CardDescription>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!canWrite}
            onClick={onEdit}
          >
            <Pencil className="size-4 mr-1" />
            {t('Edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canWrite}
            onClick={onRotate}
          >
            <KeyRound className="size-4 mr-1" />
            {t('Rotate token')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('Delete')}
            disabled={!canWrite}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <Fact label={t('Tools')}>
            {t('{count, plural, =0 {No tools} =1 {1 tool} other {# tools}}', {
              count: service.tools.length,
            })}
          </Fact>
          <Fact label={t('Token')}>
            <span className="font-mono">
              {mcpServiceUtils.maskedToken(service.tokenHint)}
            </span>
          </Fact>
          <Fact label={t('Last used')}>
            {service.lastUsedAt ? (
              <FormattedDate
                date={new Date(service.lastUsedAt)}
                includeTime={true}
              />
            ) : (
              t('Never used')
            )}
          </Fact>
        </dl>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t('Endpoint URL')}
          </span>
          <CopyToClipboardInput textToCopy={endpoint} useInput={true} />
        </div>
        {service.tools.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {service.tools.map((tool) => (
              <Badge key={tool.name} variant="accent" className="font-mono">
                {tool.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export { McpServicesPage };
