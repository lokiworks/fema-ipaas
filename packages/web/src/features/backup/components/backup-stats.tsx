import { BackupOverview } from '@fema-ipaas/shared';
import { t } from 'i18next';

import { Card } from '@/components/ui/card';
import { formatUtils } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

import { backupTime } from '../utils/backup-time';

export function BackupStats({ overview }: { overview: BackupOverview }) {
  const latest = overview.latestSuccess;
  const stats: Stat[] = [
    {
      id: 'latest',
      label: t('Latest successful backup'),
      value: latest
        ? backupTime.local({ iso: latest.finishedAt })
        : t('None yet'),
      note: latest
        ? latest.matchesCurrentVersion
          ? t('Made by the version running now ({version})', {
              version: latest.appVersion,
            })
          : t('Made by {version}, not the version running now', {
              version: latest.appVersion,
            })
        : t('Back up now to have a restore point'),
      tone: latest
        ? latest.matchesCurrentVersion
          ? 'ok'
          : 'warning'
        : 'error',
    },
    {
      id: 'next',
      label: t('Next scheduled backup'),
      value:
        overview.settings.enabled && overview.nextRunAt
          ? backupTime.local({ iso: overview.nextRunAt })
          : t('Off'),
      note: overview.settings.enabled
        ? t('Shown in your time zone ({zone})', {
            zone: backupTime.localZone(),
          })
        : t('The schedule is switched off'),
      tone: overview.settings.enabled ? 'ok' : 'warning',
    },
    {
      id: 'used',
      label: t('Space used by backups'),
      value: formatUtils.formatStorageSize(overview.usedBytes),
      note: t('{count} successful backups', { count: overview.succeededCount }),
      tone: 'neutral',
    },
    {
      id: 'free',
      label: t('Free space in the data directory'),
      value:
        overview.disk.freeBytes === null ||
        overview.disk.freeBytes === undefined
          ? '-'
          : formatUtils.formatStorageSize(overview.disk.freeBytes),
      note:
        overview.disk.totalBytes === null ||
        overview.disk.totalBytes === undefined
          ? null
          : t('of {total}', {
              total: formatUtils.formatStorageSize(overview.disk.totalBytes),
            }),
      tone: 'neutral',
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {stats.map((stat) => (
        <Card key={stat.id} className="flex flex-col gap-1 p-4">
          <span className="text-xs text-muted-foreground">{stat.label}</span>
          <span className="text-lg font-semibold">{stat.value}</span>
          {stat.note && (
            <span className={cn('text-xs', TONE_CLASSES[stat.tone])}>
              {stat.note}
            </span>
          )}
        </Card>
      ))}
    </div>
  );
}

const TONE_CLASSES = {
  ok: 'text-muted-foreground',
  neutral: 'text-muted-foreground',
  warning: 'text-warning-700 dark:text-warning-300',
  error: 'text-destructive',
};

type Stat = {
  id: string;
  label: string;
  value: string;
  note: string | null;
  tone: keyof typeof TONE_CLASSES;
};
