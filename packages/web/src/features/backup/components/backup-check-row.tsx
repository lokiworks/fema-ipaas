import { SystemOverview } from '@fema-ipaas/shared';
import dayjs from 'dayjs';
import { t } from 'i18next';
import { DatabaseBackup } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { CheckLevel, CheckRow } from '@/features/system';

import { backupHooks } from '../hooks/backup-hooks';
import { backupTime } from '../utils/backup-time';

const FRESH_HOURS = 24;

export function BackupCheckRow({ overview }: { overview: SystemOverview }) {
  const create = backupHooks.useCreate();
  const { data: backups } = backupHooks.useList();
  const running = (backups ?? []).some((backup) => backup.status === 'RUNNING');
  const { backup } = overview;
  const view = backupView({ overview });
  return (
    <CheckRow
      level={view.level}
      title={t('Back up the database')}
      action={
        backup.engineAvailable ? (
          view.offerBackup && (
            <Button
              size="sm"
              variant="outline"
              data-testid="upgrade-backup-now"
              loading={create.isPending || running}
              onClick={() => create.mutate({})}
            >
              <DatabaseBackup className="size-4" />
              {running ? t('Backing up...') : t('Back up now')}
            </Button>
          )
        ) : (
          <Button size="sm" variant="outline" asChild>
            <Link to="/tenant/infra/backup">{t('Backup and restore')}</Link>
          </Button>
        )
      }
    >
      {view.text}
    </CheckRow>
  );
}

function backupView({ overview }: { overview: SystemOverview }): BackupView {
  const { backup, release } = overview;
  if (!backup.latestSuccessAt) {
    return {
      level: 'error',
      offerBackup: true,
      text: backup.engineAvailable
        ? t(
            'There is no successful backup yet. Migrations cannot be undone, so back up now; it is the only way back.',
          )
        : t(
            'There is no successful backup, and built-in backups are not enabled on this server. Back up from the command line before upgrading; see Backup and restore.',
          ),
    };
  }
  const time = backupTime.local({ iso: backup.latestSuccessAt });
  if (!backup.matchesCurrentVersion) {
    return {
      level: 'warning',
      offerBackup: true,
      text: t(
        'The latest backup is from {time} and was made by {version}, not by the version you are running ({current}). Back up again right before upgrading.',
        {
          time,
          version: backup.latestSuccessVersion ?? '',
          current: release.current,
        },
      ),
    };
  }
  if (dayjs().diff(dayjs(backup.latestSuccessAt), 'hour', true) > FRESH_HOURS) {
    return {
      level: 'warning',
      offerBackup: true,
      text: t(
        'The latest backup is from {time}. Anything changed since then is not in it. Back up again right before upgrading.',
        { time },
      ),
    };
  }
  return {
    level: 'ok',
    offerBackup: true,
    text: t(
      'The latest backup is from {time} and was made by the version you are running.',
      { time },
    ),
  };
}

type BackupView = {
  level: CheckLevel;
  offerBackup: boolean;
  text: string;
};
