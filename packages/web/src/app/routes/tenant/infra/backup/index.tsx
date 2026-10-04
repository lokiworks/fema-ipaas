import {
  BackupEngine,
  EncryptionKeySource,
  FileLocation,
  SystemOverview,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { CenteredPage } from '@/app/components/centered-page';
import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  BackupListCard,
  BackupNotices,
  BackupNowButton,
  BackupPlanCard,
  BackupStats,
  backupHooks,
} from '@/features/backup';
import {
  CheckRow,
  DeploymentKind,
  RunbookSteps,
  systemHooks,
  systemRunbook,
} from '@/features/system';

export default function BackupPage() {
  const { data: backupOverview, isLoading: backupLoading } =
    backupHooks.useOverview();
  const { data: overview, isLoading } = systemHooks.useOverview();
  return (
    <CenteredPage
      widthClassName="max-w-[56rem]"
      title={t('Backup and restore')}
      description={t(
        'Backups cover the database and the files stored in it. The encryption key and the JWT secret are never written into a backup; keep them apart.',
      )}
      actions={
        backupOverview ? <BackupNowButton overview={backupOverview} /> : null
      }
    >
      {isLoading || backupLoading || !overview || !backupOverview ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <BackupNotices overview={backupOverview} />
          <BackupStats overview={backupOverview} />
          <BackupPlanCard overview={backupOverview} />
          <BackupListCard overview={backupOverview} />
          <WhatToBackUpCard
            overview={overview}
            fingerprint={backupOverview.keyFingerprint ?? null}
          />
          {backupOverview.engine.kind === BackupEngine.PG_DUMP && (
            <CommandLineBackups overview={overview} />
          )}
        </div>
      )}
    </CenteredPage>
  );
}

function WhatToBackUpCard({
  overview,
  fingerprint,
}: {
  overview: SystemOverview;
  fingerprint: string | null;
}) {
  const { encryptionKey, fileStorage } = overview;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('What a backup contains')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <CheckRow level="ok" title={t('Database')}>
          {t(
            'Workflows, versions, runs, connections, variables, mapping tables and settings.',
          )}
        </CheckRow>
        <CheckRow
          level={fileStorage.location === FileLocation.S3 ? 'warning' : 'ok'}
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
          title={t('Encryption key and JWT secret')}
        >
          {keyText(overview)}
          {fingerprint &&
            ` ${t(
              'Each backup records only the fingerprint of the key ({fingerprint}), so a restore check can tell whether you still have the right one.',
              { fingerprint },
            )}`}
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

function CommandLineBackups({ overview }: { overview: SystemOverview }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(DeploymentKind.COMPOSE);
  const [keepDays, setKeepDays] = useState('7');
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>{t('Back up from the command line')}</CardTitle>
            <CardDescription>
              {t(
                'For databases the platform cannot dump itself, or to keep a copy outside this server.',
              )}
            </CardDescription>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              <ChevronDown className="size-4" />
              {open ? t('Hide') : t('Show')}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-6">
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
            <RunbookSteps
              steps={systemRunbook.backupSteps({
                kind,
                keySource: overview.encryptionKey.source,
                keyPath: overview.encryptionKey.path,
                fileLocation: overview.fileStorage.location,
              })}
            />
            {kind === DeploymentKind.COMPOSE && (
              <div className="flex flex-col gap-3">
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
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
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
