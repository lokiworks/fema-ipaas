import {
  BackupEngine,
  BackupListItem,
  RestoreCheckKind,
  RestoreCheckLevel,
  RestorePrecheck,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckRow,
  DeploymentKind,
  RunbookSteps,
  systemRunbook,
} from '@/features/system';

import { backupHooks } from '../hooks/backup-hooks';
import { backupText } from '../utils/backup-text';
import { backupTime } from '../utils/backup-time';

export function RestorePrecheckDialog({
  backup,
  zone,
  onClose,
}: {
  backup: BackupListItem;
  zone: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = backupHooks.usePrecheck({ id: backup.id });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('Restore check: {time}', {
              time: backupTime.inServerZone({ iso: backup.startedAt, zone }),
            })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'This only checks. It does not change the database. Restoring is done by an administrator on the server.',
            )}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : error || !data ? (
          <Alert variant="destructive">
            <AlertTitle>{t('The check could not run')}</AlertTitle>
            <AlertDescription>
              {t(
                'Try again in a moment. If it keeps failing, see the server log.',
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <PrecheckResult precheck={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PrecheckResult({ precheck }: { precheck: RestorePrecheck }) {
  const [kind, setKind] = useState(DeploymentKind.COMPOSE);
  const keyCheck = precheck.checks.find(
    (check) => check.kind === RestoreCheckKind.ENCRYPTION_KEY,
  );
  const keyDiffers =
    keyCheck !== undefined && keyCheck.level !== RestoreCheckLevel.OK;
  return (
    <div className="flex flex-col gap-4">
      {precheck.canRestore ? (
        <Alert variant="success">
          <AlertTitle>{t('This backup can be restored')}</AlertTitle>
          <AlertDescription>
            {t('Read the warnings below, then follow the steps.')}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>{t('This backup cannot be restored')}</AlertTitle>
          <AlertDescription>
            {t('Fix the items marked as errors first.')}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col divide-y">
        {precheck.checks.map((check) => {
          const text = backupText.checkText({ check });
          return (
            <CheckRow
              key={check.kind}
              level={backupText.checkLevel({ level: check.level })}
              title={text.title}
            >
              {text.detail}
            </CheckRow>
          );
        })}
      </div>
      <OverwriteTable precheck={precheck} />
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t('Restore steps')}</h3>
          {precheck.target.engine === BackupEngine.PG_DUMP && (
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
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'The app cannot restore itself: replacing the database it is running on would cut off runs in progress, and other servers and workers would keep writing to it. Stop everything first, then run these on the server.',
          )}
        </p>
        {precheck.target.fileName && (
          <RunbookSteps
            steps={systemRunbook.restoreFromBackupSteps({
              kind,
              engine: precheck.target.engine,
              directory: precheck.target.directory,
              dataDirectory: precheck.target.dataDirectory,
              fileName: precheck.target.fileName,
              keyDiffers,
            })}
          />
        )}
      </section>
    </div>
  );
}

function OverwriteTable({ precheck }: { precheck: RestorePrecheck }) {
  const { current, backup } = precheck.overwrites;
  const rows = [
    {
      id: 'projects',
      label: t('Projects'),
      now: current.projects,
      then: backup?.projects,
    },
    {
      id: 'workflows',
      label: t('Workflows'),
      now: current.workflows,
      then: backup?.workflows,
    },
    { id: 'runs', label: t('Runs'), now: current.runs, then: backup?.runs },
    {
      id: 'connections',
      label: t('Connections'),
      now: current.connections,
      then: backup?.connections,
    },
    { id: 'users', label: t('Users'), now: current.users, then: backup?.users },
  ];
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t('What gets replaced')}</h3>
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
        <span className="text-xs text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{t('Now')}</span>
        <span className="text-xs text-muted-foreground">
          {t('After restoring')}
        </span>
        {rows.map((row) => (
          <RowCells key={row.id} {...row} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'Everything in the database is replaced by the backup: runs, changes, members and settings made since then are lost. Files in object storage are not part of it.',
        )}
      </p>
    </section>
  );
}

function RowCells({
  label,
  now,
  then,
}: {
  label: string;
  now: number;
  then: number | undefined;
}) {
  return (
    <>
      <span>{label}</span>
      <span>{now}</span>
      <span>{then === undefined ? '-' : then}</span>
    </>
  );
}
