import {
  ComponentHealthCheck,
  ComponentHealthLevel,
  HealthComponent,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { FormattedDate } from '@/components/custom/formatted-date';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/components/custom/item';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { tenantAccessHooks } from '@/features/tenant-access';

export function ComponentHealthTab() {
  const { data, isLoading, refetch, isFetching } =
    tenantAccessHooks.useComponentHealth();
  const { mutate: confirmBackup, isPending } =
    tenantAccessHooks.useConfirmBackup();
  if (isLoading || !data) {
    return <Skeleton className="mt-4 h-96 w-full" />;
  }
  const attention = data.checks.filter(
    (check) =>
      check.level === ComponentHealthLevel.WARNING ||
      check.level === ComponentHealthLevel.ERROR,
  ).length;
  return (
    <div className="flex flex-col gap-3 pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="font-medium">
            {attention > 0
              ? t('{count} items need attention', { count: attention })
              : t('Everything is running normally')}
          </span>
          <span className="text-xs text-muted-foreground">
            {t('Checked every 30 seconds. Last check:')}{' '}
            <FormattedDate date={new Date(data.checkedAt)} />
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw className="size-4" />
          {t('Check again')}
        </Button>
      </div>
      {data.checks.map((check) => (
        <Item key={check.component} variant="outline">
          <ItemContent>
            <ItemTitle>
              {componentLabel(check.component)}
              <LevelBadge level={check.level} />
            </ItemTitle>
            <ItemDescription>{describe(check)}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {check.component === HealthComponent.BACKUP ? (
              <Button
                size="sm"
                variant="outline"
                loading={isPending}
                onClick={() => confirmBackup()}
              >
                {t('I just made a backup')}
              </Button>
            ) : (
              linkFor(check.component) && (
                <Button size="sm" variant="ghost" asChild>
                  <Link to={linkFor(check.component) ?? '/'}>{t('View')}</Link>
                </Button>
              )
            )}
          </ItemActions>
        </Item>
      ))}
    </div>
  );
}

function LevelBadge({ level }: { level: ComponentHealthLevel }) {
  switch (level) {
    case ComponentHealthLevel.OK:
      return <Badge variant="success">{t('Healthy')}</Badge>;
    case ComponentHealthLevel.INFO:
      return <Badge variant="info">{t('Update available')}</Badge>;
    case ComponentHealthLevel.WARNING:
      return <Badge variant="accent">{t('Needs attention')}</Badge>;
    case ComponentHealthLevel.ERROR:
      return <Badge variant="destructive">{t('Failing')}</Badge>;
    case ComponentHealthLevel.NOT_CONFIGURED:
      return <Badge variant="outline">{t('Not configured')}</Badge>;
  }
}

function componentLabel(component: HealthComponent): string {
  switch (component) {
    case HealthComponent.DATABASE:
      return t('Database');
    case HealthComponent.QUEUE:
      return t('Cache and queue');
    case HealthComponent.TRIGGER_SCHEDULING:
      return t('Trigger scheduling');
    case HealthComponent.WEBHOOK_INTAKE:
      return t('Webhook intake');
    case HealthComponent.FILE_STORAGE:
      return t('File storage');
    case HealthComponent.CONNECTOR_REGISTRY:
      return t('Connector registry');
    case HealthComponent.SMTP:
      return t('Email (SMTP)');
    case HealthComponent.BACKUP:
      return t('Backup');
    case HealthComponent.VERSION:
      return t('Version');
    case HealthComponent.WORKERS:
      return t('Workers');
  }
}

function describe(check: ComponentHealthCheck): string {
  const facts = check.facts;
  const text = (key: string): string => String(facts[key] ?? '');
  switch (check.component) {
    case HealthComponent.DATABASE:
      return check.level === ComponentHealthLevel.ERROR
        ? t('Cannot reach PostgreSQL')
        : t('PostgreSQL {version}, answered in {ms} ms', {
            version: text('version'),
            ms: text('latencyMs'),
          });
    case HealthComponent.QUEUE:
      return check.level === ComponentHealthLevel.ERROR
        ? t('Cannot reach Redis')
        : t('{waiting} jobs waiting, {active} running, {delayed} scheduled', {
            waiting: text('waiting'),
            active: text('active'),
            delayed: text('delayed'),
          });
    case HealthComponent.TRIGGER_SCHEDULING:
      return check.level === ComponentHealthLevel.WARNING
        ? t('{count} scheduled and polling triggers, but no worker is online to run them', {
            count: text('scheduled'),
          })
        : t('{count} scheduled and polling triggers are registered', {
            count: text('scheduled'),
          });
    case HealthComponent.WEBHOOK_INTAKE:
      return t('{count} webhook triggers receive calls at {url}', {
        count: text('webhooks'),
        url: text('url'),
      });
    case HealthComponent.FILE_STORAGE:
      return facts.location === 'S3'
        ? t('Object storage, bucket {bucket}', { bucket: text('bucket') })
        : t('Files are stored in the database. Configure object storage before running more than one app instance.');
    case HealthComponent.CONNECTOR_REGISTRY:
      return check.level === ComponentHealthLevel.NOT_CONFIGURED
        ? t('Not configured. Only the connectors built into the image are available.')
        : t('Connected to {host}', { host: text('host') });
    case HealthComponent.SMTP:
      return check.level === ComponentHealthLevel.NOT_CONFIGURED
        ? t('Not configured. Email notifications and invitation emails are not sent.')
        : t('Sending through {host}', { host: text('host') });
    case HealthComponent.BACKUP:
      return check.level === ComponentHealthLevel.NOT_CONFIGURED
        ? t('The platform does not run backups itself and no backup has been recorded yet.')
        : t('Last backup recorded on {date}. The platform does not run backups itself.', {
            date: new Date(text('confirmedAt')).toLocaleDateString(),
          });
    case HealthComponent.VERSION:
      return facts.updateCheckFailed === true
        ? t('Running {current}. Could not reach the update server.', {
            current: text('current'),
          })
        : check.level === ComponentHealthLevel.INFO
        ? t('Running {current}, {latest} is available', {
            current: text('current'),
            latest: text('latest'),
          })
        : t('Running {current}, the latest version', {
            current: text('current'),
          });
    case HealthComponent.WORKERS:
      return t('{online} online, {draining} draining, {offline} offline, {mismatched} on a different version', {
        online: text('online'),
        draining: text('draining'),
        offline: text('offline'),
        mismatched: text('versionMismatched'),
      });
  }
}

function linkFor(component: HealthComponent): string | null {
  switch (component) {
    case HealthComponent.WORKERS:
      return '/tenant/infra/workers';
    case HealthComponent.VERSION:
    case HealthComponent.SMTP:
    case HealthComponent.CONNECTOR_REGISTRY:
    case HealthComponent.FILE_STORAGE:
      return '/tenant/infra/system';
    case HealthComponent.TRIGGER_SCHEDULING:
      return '/tenant/infra/triggers';
    default:
      return null;
  }
}
