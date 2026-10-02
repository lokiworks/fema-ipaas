import {
  EncryptionKeySource,
  OptionalServiceKind,
  SystemOverview,
  UpdateCheckStatus,
} from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { Download, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { CenteredPage } from '@/app/components/centered-page';
import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckLevel,
  CheckRow,
  DeploymentKind,
  RunbookSteps,
  systemHooks,
  systemRunbook,
} from '@/features/system';

export default function SystemPage() {
  const { data: overview, isLoading } = systemHooks.useOverview();
  const download = systemHooks.useDownloadDiagnostics();
  return (
    <CenteredPage
      widthClassName="max-w-[48rem]"
      title={t('System and upgrades')}
      description={t(
        'Check the version and follow the upgrade steps. Upgrades are run on the server; this page never restarts anything.',
      )}
      actions={
        <Button
          variant="outline"
          loading={download.isPending}
          onClick={() => download.mutate()}
        >
          <Download className="size-4" />
          {t('Download diagnostics')}
        </Button>
      }
    >
      {isLoading || !overview ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Tabs defaultValue="upgrade">
          <TabsList>
            <TabsTrigger value="upgrade">
              {t('Version and upgrade')}
            </TabsTrigger>
            <TabsTrigger value="services">{t('Optional services')}</TabsTrigger>
          </TabsList>
          <TabsContent value="upgrade" className="flex flex-col gap-4">
            <CurrentVersionCard overview={overview} />
            <UpdateCard overview={overview} />
          </TabsContent>
          <TabsContent value="services">
            <ServicesCard overview={overview} />
          </TabsContent>
        </Tabs>
      )}
    </CenteredPage>
  );
}

function CurrentVersionCard({ overview }: { overview: SystemOverview }) {
  const installed = dayjs(overview.installedAt);
  const skewed = systemRunbook.isVersionSkewed({
    current: overview.release.current,
    workerVersions: overview.workers.versions,
  });
  const facts = [
    { label: t('Version'), value: overview.release.current },
    {
      label: t('Installed'),
      value: t('{date} ({days} days ago)', {
        date: installed.format('YYYY-MM-DD'),
        days: dayjs().diff(installed, 'day'),
      }),
    },
    {
      label: t('Database'),
      value: overview.database.ok
        ? `PostgreSQL ${overview.database.version ?? ''}`.trim()
        : t('Not reachable'),
    },
    {
      label: t('Queue'),
      value: overview.redis.ok
        ? `Redis ${overview.redis.version ?? ''} · ${overview.redis.type}`
        : t('Not reachable'),
    },
    {
      label: t('Workers online'),
      value:
        overview.workers.online === 0
          ? t('None')
          : `${overview.workers.online} · ${overview.workers.versions.join(
              ', ',
            )}`,
    },
    {
      label: t('Container type'),
      value: systemRunbook.containerTypeLabel({
        containerType: overview.containerType,
      }),
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Current version')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="text-sm font-medium break-all">{fact.value}</dd>
            </div>
          ))}
        </dl>
        {skewed && (
          <Alert variant="warning">
            <AlertTitle>{t('Some workers run a different version')}</AlertTitle>
            <AlertDescription>
              {t(
                'Workers on a different version than the app do not pick up jobs. Upgrade them to {version}.',
                { version: overview.release.current },
              )}{' '}
              <Link to="/tenant/infra/workers" className="underline">
                {t('Workers')}
              </Link>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function UpdateCard({ overview }: { overview: SystemOverview }) {
  const recheck = systemHooks.useRecheck();
  const { release } = overview;
  const checkedAt = dayjs(release.checkedAt).format('YYYY-MM-DD HH:mm');
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>{t('Updates')}</CardTitle>
            <CardDescription>
              {t('Last checked {time}', { time: checkedAt })}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            loading={recheck.isPending}
            onClick={() => recheck.mutate()}
          >
            <RefreshCw className="size-4" />
            {t('Check again')}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <UpdateStatus overview={overview} />
        </CardContent>
      </Card>
      {release.updateCheck === UpdateCheckStatus.UPDATE_AVAILABLE &&
        release.latest && (
          <UpgradeGuide overview={overview} targetVersion={release.latest} />
        )}
    </>
  );
}

function UpdateStatus({ overview }: { overview: SystemOverview }) {
  const { release } = overview;
  switch (release.updateCheck) {
    case UpdateCheckStatus.UP_TO_DATE:
      return (
        <CheckRow level="ok" title={t('You are on the latest version')}>
          {t(
            'New versions show up here with step-by-step upgrade instructions.',
          )}
        </CheckRow>
      );
    case UpdateCheckStatus.UPDATE_AVAILABLE:
      return (
        <CheckRow
          level="info"
          title={t('Version {version} is available', {
            version: release.latest ?? '',
          })}
        >
          {t('Read the release notes for breaking changes before upgrading.')}
        </CheckRow>
      );
    case UpdateCheckStatus.FAILED:
      return (
        <Alert variant="warning">
          <AlertTitle>{t('Could not reach the update server')}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>
              {t(
                'The server cannot reach the internet, or needs a proxy. Set HTTPS_PROXY for the app and restart it. On an isolated network, copy the image in from a machine that has access:',
              )}
            </span>
            <CopyToClipboardInput
              useInput={false}
              textToCopy={`docker pull ghcr.io/lokiworks/fema-ipaas:<version>\ndocker save ghcr.io/lokiworks/fema-ipaas:<version> | gzip > fema-<version>.tar.gz\n# on the server\ndocker load -i fema-<version>.tar.gz`}
            />
          </AlertDescription>
        </Alert>
      );
  }
}

function UpgradeGuide({
  overview,
  targetVersion,
}: {
  overview: SystemOverview;
  targetVersion: string;
}) {
  const [kind, setKind] = useState(DeploymentKind.COMPOSE);
  const checks = preUpgradeChecks({ overview, targetVersion });
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('1. Before you upgrade')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {checks.map((check) => (
            <CheckRow key={check.id} level={check.level} title={check.title}>
              {check.text}
            </CheckRow>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('2. Run the upgrade')}</CardTitle>
          <CardDescription>
            {t('Run these on the server, in order.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={kind}
            onValueChange={(value) =>
              setKind(
                value === DeploymentKind.HELM
                  ? DeploymentKind.HELM
                  : DeploymentKind.COMPOSE,
              )
            }
          >
            <TabsList>
              <TabsTrigger value={DeploymentKind.COMPOSE}>
                Docker Compose
              </TabsTrigger>
              <TabsTrigger value={DeploymentKind.HELM}>
                Kubernetes (Helm)
              </TabsTrigger>
            </TabsList>
            <TabsContent value={kind} className="pt-4">
              <RunbookSteps
                steps={systemRunbook.upgradeSteps({ kind, targetVersion })}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('If something goes wrong')}</CardTitle>
          <CardDescription>
            {t(
              'Migrations cannot be undone, so going back means restoring the backup taken before the upgrade.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunbookSteps
            steps={systemRunbook.rollbackSteps({
              kind,
              currentVersion: overview.release.current,
            })}
          />
        </CardContent>
      </Card>
    </>
  );
}

function ServicesCard({ overview }: { overview: SystemOverview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Optional services')}</CardTitle>
        <CardDescription>
          {t(
            'None of these are required. Features that need an unconfigured service stay switched off instead of failing. Configure them with environment variables and restart the app.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {overview.services.map((service) => {
          const meta = SERVICE_META[service.kind];
          return (
            <div key={service.kind} className="flex flex-col gap-1 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{meta.name()}</span>
                <Badge variant={service.enabled ? 'success' : 'outline'}>
                  {service.enabled ? t('Enabled') : t('Not configured')}
                </Badge>
                {service.detail && (
                  <span className="truncate text-xs text-muted-foreground">
                    {service.detail}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {service.enabled ? meta.enabled() : meta.disabled()}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {meta.variables}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function preUpgradeChecks({
  overview,
  targetVersion,
}: {
  overview: SystemOverview;
  targetVersion: string;
}): PreUpgradeCheck[] {
  const keyMissing =
    overview.encryptionKey.source === EncryptionKeySource.MISSING;
  const skewed = systemRunbook.isVersionSkewed({
    current: overview.release.current,
    workerVersions: overview.workers.versions,
  });
  return [
    {
      id: 'backup',
      level: 'warning',
      title: t('Back up the database'),
      text: t(
        'Migrations cannot be undone. Take a backup right before upgrading; it is the only way back. See Backup and restore.',
      ),
    },
    {
      id: 'key',
      level: keyMissing ? 'error' : 'ok',
      title: t('Encryption key'),
      text: keyMissing
        ? t(
            'No encryption key is configured. Set FEMA_ENCRYPTION_KEY before upgrading.',
          )
        : t(
            'Keep a copy of the encryption key apart from the backup. Without it, a restored database cannot decrypt connections.',
          ),
    },
    {
      id: 'workers',
      level: skewed ? 'warning' : 'info',
      title: t('Workers'),
      text: t(
        'Upgrade every worker to {version} together with the app. Workers on another version do not pick up jobs.',
        { version: targetVersion },
      ),
    },
    {
      id: 'notes',
      level: 'info',
      title: t('Release notes'),
      text: t(
        'Check the release notes of every version between {from} and {to} for breaking changes and environment variables to rename.',
        { from: overview.release.current, to: targetVersion },
      ),
    },
  ];
}

const SERVICE_META: Record<OptionalServiceKind, ServiceMeta> = {
  [OptionalServiceKind.SMTP]: {
    name: () => t('Email (SMTP)'),
    enabled: () =>
      t('Used for email alerts, invitations and password reset emails.'),
    disabled: () =>
      t(
        'Email alert channels and invitation emails are unavailable. Share sign-in links by hand; admins reset passwords.',
      ),
    variables:
      'FEMA_SMTP_HOST · FEMA_SMTP_PORT · FEMA_SMTP_USERNAME · FEMA_SMTP_PASSWORD · FEMA_SMTP_SENDER_EMAIL',
  },
  [OptionalServiceKind.OBJECT_STORAGE]: {
    name: () => t('Object storage'),
    enabled: () =>
      t(
        'Run files and logs are written to the bucket. Existing files are not moved.',
      ),
    disabled: () =>
      t(
        'Files are stored in the database. Fine for one app instance; several app instances should share object storage.',
      ),
    variables:
      'FEMA_FILE_STORAGE_LOCATION=S3 · FEMA_S3_ENDPOINT · FEMA_S3_BUCKET · FEMA_S3_ACCESS_KEY_ID · FEMA_S3_SECRET_ACCESS_KEY',
  },
  [OptionalServiceKind.CONNECTOR_REGISTRY]: {
    name: () => t('Connector registry'),
    enabled: () => t('Connectors can be installed and updated online.'),
    disabled: () =>
      t('Only the connectors built into the image are available.'),
    variables: 'FEMA_CONNECTOR_REGISTRY_URL',
  },
  [OptionalServiceKind.TEMPLATE_REGISTRY]: {
    name: () => t('Template registry'),
    enabled: () => t('The template gallery loads templates from this source.'),
    disabled: () => t('The template gallery is empty.'),
    variables: 'FEMA_TEMPLATES_SOURCE_URL',
  },
};

type PreUpgradeCheck = {
  id: string;
  level: CheckLevel;
  title: string;
  text: string;
};

type ServiceMeta = {
  name: () => string;
  enabled: () => string;
  disabled: () => string;
  variables: string;
};
