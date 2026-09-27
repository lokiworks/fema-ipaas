import {
  EncryptionKeySource,
  FileLocation,
  SystemOverview,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { CenteredPage } from '@/app/components/centered-page';
import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckRow,
  DeploymentKind,
  RunbookSteps,
  systemHooks,
  systemRunbook,
} from '@/features/system';

export default function BackupPage() {
  const { data: overview, isLoading } = systemHooks.useOverview();
  const [kind, setKind] = useState(DeploymentKind.COMPOSE);
  return (
    <CenteredPage
      widthClassName="max-w-[48rem]"
      title={t('Backup and restore')}
      description={t(
        'A backup is the database plus the encryption key. The platform does not run backups itself; run these commands on the server or schedule them.',
      )}
      actions={
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
            <TabsTrigger value={DeploymentKind.HELM}>Helm</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {isLoading || !overview ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <WhatToBackUpCard overview={overview} />
          <Card>
            <CardHeader>
              <CardTitle>{t('Back up')}</CardTitle>
            </CardHeader>
            <CardContent>
              <RunbookSteps
                steps={systemRunbook.backupSteps({
                  kind,
                  keySource: overview.encryptionKey.source,
                  keyPath: overview.encryptionKey.path,
                  fileLocation: overview.fileStorage.location,
                })}
              />
            </CardContent>
          </Card>
          {kind === DeploymentKind.COMPOSE && <ScheduleCard />}
          <Card>
            <CardHeader>
              <CardTitle>{t('Restore')}</CardTitle>
              <CardDescription>
                {t(
                  'Restoring replaces everything in the database with the backup. Runs and changes made after the backup are lost.',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RunbookSteps
                steps={systemRunbook.restoreSteps({
                  kind,
                  keySource: overview.encryptionKey.source,
                  keyPath: overview.encryptionKey.path,
                })}
              />
            </CardContent>
          </Card>
          <Alert variant="primary">
            <AlertTitle>{t('Test your backups')}</AlertTitle>
            <AlertDescription>
              {t(
                'Restore a backup into a scratch environment now and then. A backup that was never restored is a guess.',
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </CenteredPage>
  );
}

function WhatToBackUpCard({ overview }: { overview: SystemOverview }) {
  const { encryptionKey, fileStorage } = overview;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('What to back up')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <CheckRow level="info" title={t('Database')}>
          {t(
            'Workflows, versions, runs, connections, variables, mapping tables and settings.',
          )}
        </CheckRow>
        <CheckRow
          level={fileStorage.location === FileLocation.S3 ? 'warning' : 'info'}
          title={t('Files')}
        >
          {fileStorage.location === FileLocation.S3
            ? t(
                'Files are in object storage, not in the database backup. Turn on bucket versioning or replication.',
              )
            : t(
                'Files are stored in the database, so the database backup covers them.',
              )}
        </CheckRow>
        <CheckRow
          level={
            encryptionKey.source === EncryptionKeySource.MISSING
              ? 'error'
              : 'warning'
          }
          title={t('Encryption key')}
        >
          {keyText(overview)}
          {encryptionKey.retiredKeys > 0 &&
            ` ${t(
              'Also keep the {count} retired keys in FEMA_RETIRED_ENCRYPTION_KEYS.',
              {
                count: encryptionKey.retiredKeys,
              },
            )}`}
        </CheckRow>
        <CheckRow level="info" title={t('Queue')}>
          {t(
            'Redis only holds queued jobs and caches. It does not need a backup.',
          )}
        </CheckRow>
      </CardContent>
    </Card>
  );
}

function ScheduleCard() {
  const [keepDays, setKeepDays] = useState('7');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Back up every night')}</CardTitle>
        <CardDescription>
          {t(
            'Add this line to the crontab of the server user that runs Docker. It backs up at 02:00 and deletes old backups.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span>{t('Keep backups for')}</span>
          <Select value={keepDays} onValueChange={setKeepDays}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KEEP_DAYS_OPTIONS.map((days) => (
                <SelectItem key={days} value={String(days)}>
                  {t('{count} days', { count: days })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CopyToClipboardInput
          useInput={false}
          textToCopy={systemRunbook.scheduleCommand({
            keepDays: Number(keepDays),
          })}
        />
      </CardContent>
    </Card>
  );
}

function keyText(overview: SystemOverview): string {
  switch (overview.encryptionKey.source) {
    case EncryptionKeySource.ENVIRONMENT:
      return t(
        'Set through FEMA_ENCRYPTION_KEY. Save that value apart from the database backup; without it, a restored database cannot decrypt connections.',
      );
    case EncryptionKeySource.GENERATED_FILE:
      return t(
        'Generated on first start and stored in {path}/settings.json inside the app container. Copy that file out and save it apart from the database backup.',
        { path: overview.encryptionKey.path ?? '' },
      );
    case EncryptionKeySource.MISSING:
      return t(
        'No encryption key is configured. Set FEMA_ENCRYPTION_KEY before storing any connection.',
      );
  }
}

const KEEP_DAYS_OPTIONS = [7, 14, 30];
