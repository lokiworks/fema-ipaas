import { BackupOverview, BackupStatus } from '@fema-ipaas/shared';
import { t } from 'i18next';
import { DatabaseBackup } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { backupHooks } from '../hooks/backup-hooks';

export function BackupNowButton({ overview }: { overview: BackupOverview }) {
  const create = backupHooks.useCreate();
  const { data: backups } = backupHooks.useList();
  const running = (backups ?? []).some(
    (backup) => backup.status === BackupStatus.RUNNING,
  );
  return (
    <Button
      loading={create.isPending || running}
      disabled={!overview.engine.available}
      onClick={() => create.mutate({})}
    >
      <DatabaseBackup className="size-4" />
      {running ? t('Backing up...') : t('Back up now')}
    </Button>
  );
}
