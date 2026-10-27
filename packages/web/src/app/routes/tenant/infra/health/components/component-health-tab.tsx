import {
  ComponentHealthCheck,
  ComponentHealthLevel,
  HealthComponent,
  WorkerNode,
  WorkerNodeStatus,
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
import { tenantAccessHooks, tenantAccessUtils } from '@/features/tenant-access';

export function ComponentHealthTab() {
  const { data, isLoading, refetch, isFetching } =
    tenantAccessHooks.useComponentHealth();
  const { mutate: confirmBackup, isPending } =
    tenantAccessHooks.useConfirmBackup();
  const { data: fleet } = tenantAccessHooks.useWorkerFleet();
  const workerCounts = fleet
    ? countWorkers(tenantAccessUtils.dedupeWorkerNodes(fleet.nodes))
    : null;
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
              {isUpdateCheckUnavailable(check) ? (
                <Badge variant="outline">{t('Cannot check')}</Badge>
              ) : (
                <LevelBadge level={check.level} />
              )}
            </ItemTitle>
            <ItemDescription>
              {describe({ check, workerCounts })}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            {check.component === HealthComponent.BACKUP ? (
              <div className="flex gap-2">
                <Button size="sm" variant="link" asChild>
                  <Link to="/tenant/infra/backup">{t('View')}</Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={isPending}
                  onClick={() => confirmBackup()}
                >
                  {t('I just made a backup')}
                </Button>
              </div>
            ) : (
              linkFor(check.component) && (
                <Button size="sm" variant="link" asChild>
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

function isUpdateCheckUnavailable(check: ComponentHealthCheck): boolean {
  return (
    check.component === HealthComponent.VERSION &&
    check.level === ComponentHealthLevel.OK &&
    check.facts.updateCheckFailed === true
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

function countWorkers(nodes: WorkerNode[]): WorkerCounts {
  const countOf = (status: WorkerNodeStatus) =>
    nodes.filter((node) => node.status === status).length;
  return {
    online: countOf(WorkerNodeStatus.ONLINE),
    draining: countOf(WorkerNodeStatus.DRAINING),
    offline: countOf(WorkerNodeStatus.OFFLINE),
    versionMismatched: nodes.filter(
      (node) =>
        node.status !== WorkerNodeStatus.OFFLINE && !node.versionMatchesApp,
    ).length,
  };
}

function describe({
  check,
  workerCounts,
}: {
  check: ComponentHealthCheck;
  workerCounts: WorkerCounts | null;
}): string {
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
        ? t(
            '{count} scheduled and polling triggers, but no worker is online to run them',
            {
              count: Number(facts.scheduled ?? 0),
            },
          )
        : t('{count} scheduled and polling triggers are registered', {
            count: Number(facts.scheduled ?? 0),
          });
    case HealthComponent.WEBHOOK_INTAKE:
      return t('{count} webhook triggers receive calls at {url}', {
        count: Number(facts.webhooks ?? 0),
        url: text('url'),
      });
    case HealthComponent.FILE_STORAGE:
      return facts.location === 'S3'
        ? t('Object storage, bucket {bucket}', { bucket: text('bucket') })
        : t(
            'Files are stored in the database. Configure object storage before running more than one app instance.',
          );
    case HealthComponent.CONNECTOR_REGISTRY:
      return check.level === ComponentHealthLevel.NOT_CONFIGURED
        ? t(
            'Not configured. Only the connectors built into the image are available.',
          )
        : t('Connected to {host}', { host: text('host') });
    case HealthComponent.SMTP:
      return check.level === ComponentHealthLevel.NOT_CONFIGURED
        ? t(
            'Not configured. Email notifications and invitation emails are not sent.',
          )
        : t('Sending through {host}', { host: text('host') });
    case HealthComponent.BACKUP:
      return backupText({ check, facts });
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
      return t(
        '{online} online, {draining} draining, {offline} offline, {mismatched} on a different version',
        {
          online: workerCounts?.online ?? text('online'),
          draining: workerCounts?.draining ?? text('draining'),
          offline: workerCounts?.offline ?? text('offline'),
          mismatched:
            workerCounts?.versionMismatched ?? text('versionMismatched'),
        },
      );
  }
}

function backupText({
  check,
  facts,
}: {
  check: ComponentHealthCheck;
  facts: ComponentHealthCheck['facts'];
}): string {
  if (check.level === ComponentHealthLevel.NOT_CONFIGURED) {
    return t(
      'No backup yet. Back up on the Backup and restore page, or confirm one you made from the command line.',
    );
  }
  const platformAt =
    typeof facts.platformBackupAt === 'string' ? facts.platformBackupAt : null;
  const confirmedAt =
    typeof facts.confirmedAt === 'string' ? facts.confirmedAt : null;
  const platformIsNewest =
    platformAt !== null &&
    (confirmedAt === null || new Date(platformAt) >= new Date(confirmedAt));
  return platformIsNewest
    ? t('Last backup made by the platform on {date}.', {
        date: new Date(platformAt).toLocaleDateString(),
      })
    : t('Last backup you confirmed on {date}.', {
        date: new Date(confirmedAt ?? '').toLocaleDateString(),
      });
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

type WorkerCounts = {
  online: number;
  draining: number;
  offline: number;
  versionMismatched: number;
};
