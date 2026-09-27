import { ConnectorBlueprintDetail } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/custom/empty';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { connectorBlueprintHooks } from '../../hooks/connector-blueprint-hooks';
import { blueprintIconUtils } from '../../utils/blueprint-icon-utils';

import { AuthConfirmDialog } from './auth-confirm-dialog';
import { authDraftUtils } from './auth-draft-utils';
import { NewAuthDialog } from './new-auth-dialog';

export function BlueprintAuthOverview({
  detail,
}: {
  detail: ConnectorBlueprintDetail;
}) {
  const navigate = useNavigate();
  const auth = detail.definition.auth;
  const enabled = Boolean(auth?.enabled);
  const connectionCount = detail.usage.connections;
  const [newAuthOpen, setNewAuthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    'disable' | 'delete' | null
  >(null);
  const { mutate, isPending } =
    connectorBlueprintHooks.useUpdateConnectorBlueprint({
      id: detail.id,
      onSuccess: () => setPendingAction(null),
    });

  if (!auth) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Header />
        <ServiceCard detail={detail} />
        <section className="flex flex-col gap-3 rounded-md border p-4">
          <h2 className="font-medium">{t('Authentication')}</h2>
          <Empty className="border-none p-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldQuestion />
              </EmptyMedia>
              <EmptyTitle>{t('No authentication yet')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'Workflow nodes calling this service will not need a connection. Create an authentication when the service requires one.',
                )}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={() => setNewAuthOpen(true)}>
                {t('New authentication')}
              </Button>
            </EmptyContent>
          </Empty>
        </section>
        <NewAuthDialog
          open={newAuthOpen}
          onOpenChange={setNewAuthOpen}
          detail={detail}
        />
      </div>
    );
  }

  const base = `/tenant/connectors/development/${detail.id}`;
  const everPublished = detail.authStatus.everPublished;
  const statusText = detail.authStatus.published
    ? t('Published')
    : everPublished
    ? t('Published · has unpublished changes')
    : t('Draft');

  const setEnabled = (value: boolean) => {
    mutate({
      definition: { ...detail.definition, auth: { ...auth, enabled: value } },
    });
  };

  const confirmDisable = () => {
    mutate({
      definition: { ...detail.definition, auth: { ...auth, enabled: false } },
    });
  };

  const confirmDelete = () => {
    mutate({ definition: { ...detail.definition, auth: null } });
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Header />
      <ServiceCard detail={detail} />
      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t('Authentication')}</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" disabled onClick={() => setNewAuthOpen(true)}>
                  {t('New authentication')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t(
                'Each connector can only have one authentication. Delete the current draft authentication before creating another.',
              )}
            </TooltipContent>
          </Tooltip>
        </div>
        <RadioGroup
          value={enabled ? 'auth' : 'none'}
          onValueChange={(value) => {
            if (value === 'none' && enabled) {
              setPendingAction('disable');
              return;
            }
            if (value === 'auth' && !enabled) {
              setEnabled(true);
            }
          }}
          className="gap-2"
        >
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
            <RadioGroupItem value="none" className="mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {t('No authentication')}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(
                  'The service is public, or credentials are already embedded in the request',
                )}
              </span>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
            <RadioGroupItem value="auth" className="mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {auth.name} · {authDraftUtils.authTypeLabel(auth.type)}
              </span>
              <span className="text-xs text-muted-foreground">
                {statusText} ·{' '}
                {t('{count} connections using it', { count: connectionCount })}
              </span>
            </div>
          </label>
        </RadioGroup>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => navigate(`${base}/auth/dev`)}>
            {t('Develop authentication')}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={everPublished}
                  onClick={() => setPendingAction('delete')}
                >
                  {t('Delete authentication')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {everPublished
                ? t(
                    'Once an authentication has been published it cannot be deleted',
                  )
                : t(
                    'You can delete it and create another one, choosing a different authentication type',
                  )}
            </TooltipContent>
          </Tooltip>
          <span className="text-xs text-muted-foreground">
            {!enabled
              ? t(
                  'Not using authentication right now; the configuration is kept',
                )
              : detail.authStatus.published
              ? t(
                  'Publishing authentication takes effect immediately and cannot be undone',
                )
              : t('Pass all tests before you can publish the authentication')}
          </span>
        </div>
      </section>
      <NewAuthDialog
        open={newAuthOpen}
        onOpenChange={setNewAuthOpen}
        detail={detail}
      />
      <AuthConfirmDialog
        open={pendingAction === 'disable'}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={t('Switch to no authentication?')}
        description={
          connectionCount > 0
            ? t(
                'Workflow nodes will no longer require a connection. The existing {count} connections are kept. The authentication configuration is not deleted; you can switch back at any time.',
                { count: connectionCount },
              )
            : t(
                'Workflow nodes will no longer require a connection. The authentication configuration is not deleted; you can switch back at any time.',
              )
        }
        confirmLabel={t('No authentication')}
        onConfirm={confirmDisable}
        isPending={isPending}
      />
      <AuthConfirmDialog
        open={pendingAction === 'delete'}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={t('Delete authentication "{name}"?', { name: auth.name })}
        description={t(
          'This authentication has not been published yet. After deleting it you can create a new one and choose a different authentication type.',
        )}
        confirmLabel={t('Delete')}
        onConfirm={confirmDelete}
        isPending={isPending}
        danger
      />
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold">
        {t('Authentication and authorization')}
      </h1>
      <p className="text-sm text-muted-foreground">
        {t(
          'Define how workflows prove their identity when calling this service.',
        )}
      </p>
    </div>
  );
}

function ServiceCard({ detail }: { detail: ConnectorBlueprintDetail }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="font-medium">{t('Service to integrate')}</h2>
      <div className="flex items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-base font-semibold text-white"
          style={{ background: detail.iconColor }}
        >
          {blueprintIconUtils.letterOf(detail.displayName)}
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{detail.displayName}</span>
          <span
            className={cn(
              'font-mono text-xs',
              !detail.definition.baseUrl && 'text-muted-foreground',
            )}
          >
            {detail.definition.baseUrl || t('Base URL needs configuration')}
          </span>
        </div>
      </div>
    </section>
  );
}
