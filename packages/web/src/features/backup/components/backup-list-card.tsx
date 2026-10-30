import {
  BackupListItem,
  BackupOverview,
  BackupStatus,
} from '@fema-ipaas/shared';
import { t } from 'i18next';
import { DatabaseBackup, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDeleteDialog } from '@/components/custom/delete-dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatUtils } from '@/lib/format-utils';

import { backupApi } from '../api/backup-api';
import { backupHooks } from '../hooks/backup-hooks';
import { backupText } from '../utils/backup-text';
import { backupTime } from '../utils/backup-time';

import { BackupNowButton } from './backup-now-button';
import { RestorePrecheckDialog } from './restore-precheck-dialog';

export function BackupListCard({ overview }: { overview: BackupOverview }) {
  const { data: backups, isLoading } = backupHooks.useList();
  const [checking, setChecking] = useState<BackupListItem | null>(null);
  const refresh = backupHooks.useRefresh();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Backups')}</CardTitle>
        <CardDescription>
          {t(
            'Check a backup before relying on it. The check never changes any data. Times are in your time zone ({zone}).',
            { zone: backupTime.localZone() },
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !backups ? (
          <Skeleton className="h-40 w-full" />
        ) : backups.length === 0 ? (
          <EmptyBackups overview={overview} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Started')}</TableHead>
                <TableHead>{t('Type')}</TableHead>
                <TableHead>{t('Version')}</TableHead>
                <TableHead>{t('Size')}</TableHead>
                <TableHead>{t('Result')}</TableHead>
                <TableHead>{t('Restorable')}</TableHead>
                <TableHead className="text-right">{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.id} data-testid="backup-row">
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-col">
                      <span>{backupTime.local({ iso: backup.startedAt })}</span>
                      {backup.note && (
                        <span className="text-xs text-muted-foreground">
                          {backup.note}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {backupText.triggerLabel({ trigger: backup.trigger })}
                  </TableCell>
                  <TableCell>{backup.appVersion}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {backup.sizeBytes === null || backup.sizeBytes === undefined
                      ? '-'
                      : formatUtils.formatStorageSize(backup.sizeBytes)}
                  </TableCell>
                  <TableCell>
                    <ResultBadge backup={backup} />
                  </TableCell>
                  <TableCell>
                    <RestorableBadge backup={backup} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={backup.status !== BackupStatus.SUCCEEDED}
                        onClick={() => setChecking(backup)}
                      >
                        <ShieldCheck className="size-4" />
                        {t('Check restore')}
                      </Button>
                      <ConfirmationDeleteDialog
                        title={t('Delete this backup?')}
                        message={t(
                          'The backup file is removed from the server and cannot be brought back.',
                        )}
                        entityName={t('Backup')}
                        showToast
                        isDanger
                        buttonText={t('Delete')}
                        mutationFn={async () => {
                          await backupApi.remove({ id: backup.id });
                          refresh();
                        }}
                        warning={
                          overview.succeededCount === 1 &&
                          backup.status === BackupStatus.SUCCEEDED
                            ? t(
                                'This is the only successful backup. After deleting it there is nothing to restore.',
                              )
                            : undefined
                        }
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('Delete backup')}
                          disabled={backup.status === BackupStatus.RUNNING}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </ConfirmationDeleteDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {checking && (
        <RestorePrecheckDialog
          key={checking.id}
          backup={checking}
          onClose={() => setChecking(null)}
        />
      )}
    </Card>
  );
}

function EmptyBackups({ overview }: { overview: BackupOverview }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <DatabaseBackup className="size-8 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t('No backups yet')}</span>
        <span className="max-w-sm text-xs text-muted-foreground">
          {overview.engine.available
            ? t(
                'Back up now to have a restore point. The schedule above takes over from there.',
              )
            : t(
                'Built-in backups are not enabled on this server. See the notice at the top of this page.',
              )}
        </span>
      </div>
      <BackupNowButton overview={overview} />
    </div>
  );
}

function ResultBadge({ backup }: { backup: BackupListItem }) {
  if (backup.status === BackupStatus.RUNNING) {
    return <Badge variant="info">{t('Running')}</Badge>;
  }
  if (backup.status === BackupStatus.SUCCEEDED) {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="success">{t('Succeeded')}</Badge>
        {backup.error && (
          <span className="max-w-56 text-xs text-warning-700 dark:text-warning-300">
            {backup.error}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Badge variant="destructive">{t('Failed')}</Badge>
      {backup.error && (
        <span className="max-w-56 text-xs text-muted-foreground">
          {backup.error}
        </span>
      )}
    </div>
  );
}

function RestorableBadge({ backup }: { backup: BackupListItem }) {
  if (backup.restorable) {
    return <Badge variant="success">{t('Yes')}</Badge>;
  }
  const reason = backup.unrestorableReason;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline">{t('No')}</Badge>
      </TooltipTrigger>
      {reason && (
        <TooltipContent className="max-w-xs">
          {backupText.unrestorableText({ reason })}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
