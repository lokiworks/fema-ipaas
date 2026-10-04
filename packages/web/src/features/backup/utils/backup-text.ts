import {
  BackupEngine,
  BackupEngineProblem,
  BackupStatus,
  BackupTrigger,
  BackupUnrestorableReason,
  RestoreCheck,
  RestoreCheckKind,
  RestoreCheckLevel,
} from '@fema-ipaas/shared';
import { t } from 'i18next';

import { CheckLevel } from '@/features/system';
import { formatUtils } from '@/lib/format-utils';

export const backupText = {
  triggerLabel,
  statusLabel,
  unrestorableText,
  engineProblemTitle,
  checkLevel,
  checkText,
  weekdayLabel,
  engineLabel,
};

function triggerLabel({ trigger }: { trigger: BackupTrigger }): string {
  return trigger === BackupTrigger.MANUAL ? t('Manual') : t('Scheduled');
}

function statusLabel({ status }: { status: BackupStatus }): string {
  switch (status) {
    case BackupStatus.RUNNING:
      return t('Running');
    case BackupStatus.SUCCEEDED:
      return t('Succeeded');
    case BackupStatus.FAILED:
      return t('Failed');
  }
}

function unrestorableText({
  reason,
}: {
  reason: BackupUnrestorableReason;
}): string {
  switch (reason) {
    case BackupUnrestorableReason.FAILED:
      return t('The backup failed, so there is nothing to restore');
    case BackupUnrestorableReason.RUNNING:
      return t('The backup is still running');
    case BackupUnrestorableReason.FILE_MISSING:
      return t('The backup file is no longer in the backup directory');
    case BackupUnrestorableReason.ENGINE_MISMATCH:
      return t(
        'The backup was made with another database engine than this server uses',
      );
    case BackupUnrestorableReason.NEWER_VERSION:
      return t(
        'The backup was made by a newer version than this one. Restore it with that version or newer',
      );
  }
}

function engineProblemTitle({
  problem,
}: {
  problem: BackupEngineProblem;
}): string {
  return problem === BackupEngineProblem.PG_DUMP_MISSING
    ? t('Built-in backups are not enabled: pg_dump is not installed')
    : t('Built-in backups are not enabled: pg_dump is older than the database');
}

function engineLabel({ engine }: { engine: BackupEngine }): string {
  return engine === BackupEngine.PGLITE
    ? t('PGlite export')
    : t('PostgreSQL pg_dump');
}

function weekdayLabel({ weekday }: { weekday: number }): string {
  const weekdays = [
    t('Sunday'),
    t('Monday'),
    t('Tuesday'),
    t('Wednesday'),
    t('Thursday'),
    t('Friday'),
    t('Saturday'),
  ];
  return weekdays[weekday] ?? '';
}

function checkLevel({ level }: { level: RestoreCheckLevel }): CheckLevel {
  switch (level) {
    case RestoreCheckLevel.OK:
      return 'ok';
    case RestoreCheckLevel.WARNING:
      return 'warning';
    case RestoreCheckLevel.ERROR:
      return 'error';
  }
}

function checkText({ check }: { check: RestoreCheck }): CheckText {
  const failed = check.level === RestoreCheckLevel.ERROR;
  switch (check.kind) {
    case RestoreCheckKind.FILE_PRESENT:
      return filePresentText({ check, failed });
    case RestoreCheckKind.CHECKSUM:
      return {
        title: failed ? t('Checksum does not match') : t('Checksum matches'),
        detail: failed
          ? t(
              'The file changed after the backup was made, so it may be damaged. Do not restore it.',
            )
          : t('The SHA-256 of the file is the one recorded at backup time.'),
      };
    case RestoreCheckKind.READABLE:
      return {
        title: failed
          ? t('The file cannot be read')
          : t('The file is readable'),
        detail: failed
          ? textOf({ value: check.params.detail })
          : readableDetail({
              verifiedWith: textOf({ value: check.params.verifiedWith }),
            }),
      };
    case RestoreCheckKind.ENGINE:
      return {
        title: failed
          ? t('Database engine differs')
          : t('Database engine matches'),
        detail: failed
          ? t(
              'The backup is a {backup} file but this server uses {current}. It cannot be restored here.',
              {
                backup: engineName({ value: check.params.backup }),
                current: engineName({ value: check.params.current }),
              },
            )
          : null,
      };
    case RestoreCheckKind.VERSION:
      return versionText({ check });
    case RestoreCheckKind.ENCRYPTION_KEY:
      return keyText({ check });
    case RestoreCheckKind.TARGET_DATABASE:
      return {
        title:
          check.level === RestoreCheckLevel.OK
            ? t('The current database is empty')
            : t('The current database has data that will be replaced'),
        detail:
          check.level === RestoreCheckLevel.OK
            ? null
            : t(
                'Restoring replaces everything in it, including {workflows} workflows, {runs} runs and {connections} connections.',
                {
                  workflows: numberOf({ value: check.params.workflows }),
                  runs: numberOf({ value: check.params.runs }),
                  connections: numberOf({ value: check.params.connections }),
                },
              ),
      };
    case RestoreCheckKind.DISK_SPACE:
      return spaceText({ check });
  }
}

function filePresentText({
  check,
  failed,
}: {
  check: RestoreCheck;
  failed: boolean;
}): CheckText {
  if (!failed) {
    return {
      title: t('The backup file is there'),
      detail: formatUtils.formatStorageSize(
        numberOf({ value: check.params.sizeBytes }),
      ),
    };
  }
  switch (check.params.reason) {
    case 'SIZE_DIFFERS':
      return {
        title: t('The backup file has a different size than recorded'),
        detail: t('It was recorded as {expected} and is now {actual}.', {
          expected: formatUtils.formatStorageSize(
            numberOf({ value: check.params.expected }),
          ),
          actual: formatUtils.formatStorageSize(
            numberOf({ value: check.params.actual }),
          ),
        }),
      };
    case 'MISSING':
      return {
        title: t('The backup file is missing'),
        detail: t('It is not at {file} any more.', {
          file: textOf({ value: check.params.file }),
        }),
      };
    default:
      return {
        title: t('There is no backup file'),
        detail: t('The backup did not succeed, so no file was written.'),
      };
  }
}

function versionText({ check }: { check: RestoreCheck }): CheckText {
  const params = {
    backup: textOf({ value: check.params.backupVersion }),
    current: textOf({ value: check.params.currentVersion }),
  };
  switch (check.params.relation) {
    case 'same':
      return {
        title: t('Same version'),
        detail: t(
          'The backup was made by {backup}, the version running now.',
          params,
        ),
      };
    case 'older':
      return {
        title: t('The backup is from an older version'),
        detail: t(
          'It was made by {backup}; this is {current}. The new version migrates the restored data when it starts. Migrations cannot be undone, so take a backup right before restoring.',
          params,
        ),
      };
    case 'unknown':
      return {
        title: t('Version could not be compared'),
        detail: t('The backup says {backup}; this is {current}.', params),
      };
    default:
      return {
        title: t('The backup is from a newer version'),
        detail: t(
          'It was made by {backup}, which is newer than {current}. Start that version or newer before restoring.',
          params,
        ),
      };
  }
}

function keyText({ check }: { check: RestoreCheck }): CheckText {
  const params = {
    backup: textOf({ value: check.params.backup }),
    current: textOf({ value: check.params.current }),
  };
  switch (check.params.relation) {
    case 'same':
      return {
        title: t('Encryption key matches'),
        detail: t(
          'Both are key {current}, so connections can be decrypted.',
          params,
        ),
      };
    case 'retired':
      return {
        title: t('The backup used a retired encryption key'),
        detail: t(
          'The backup was encrypted with key {backup}, which is in FEMA_RETIRED_ENCRYPTION_KEYS, so connections can still be decrypted.',
          params,
        ),
      };
    case 'different':
      return {
        title: t('The encryption key is not the one that made the backup'),
        detail: t(
          'The backup used key {backup}; this server uses {current}. Connections in the backup cannot be decrypted until the old key is set as FEMA_ENCRYPTION_KEY or listed in FEMA_RETIRED_ENCRYPTION_KEYS.',
          params,
        ),
      };
    default:
      return {
        title: t('The encryption key could not be compared'),
        detail: t(
          'This backup does not record a key fingerprint, or no key is configured on this server.',
        ),
      };
  }
}

function spaceText({ check }: { check: RestoreCheck }): CheckText {
  const needed = formatUtils.formatStorageSize(
    numberOf({ value: check.params.neededBytes }),
  );
  if (check.params.scope === 'DATABASE_SERVER') {
    return {
      title: t('Free space on the database server'),
      detail: t(
        'Make sure the database server has about {needed} free. The platform cannot see its disk.',
        { needed },
      ),
    };
  }
  const free = check.params.freeBytes;
  return {
    title:
      check.level === RestoreCheckLevel.OK
        ? t('Enough free disk space')
        : t('Little free disk space'),
    detail:
      typeof free === 'number'
        ? t(
            'The data directory has {free} free; restoring needs about {needed}.',
            {
              free: formatUtils.formatStorageSize(free),
              needed,
            },
          )
        : t('Free space could not be read; restoring needs about {needed}.', {
            needed,
          }),
  };
}

function readableDetail({ verifiedWith }: { verifiedWith: string }): string {
  switch (verifiedWith) {
    case 'pg_restore':
      return t('pg_restore read the table of contents of the archive.');
    case 'open':
      return t(
        'The archive unpacks and the database inside it starts and answers a query.',
      );
    case 'tar':
      return t('The archive unpacks and contains a database directory.');
    case 'header':
      return t(
        'The header is valid. pg_restore is not installed on this server, so the contents were not listed.',
      );
    default:
      return t('The compressed archive is complete.');
  }
}

function engineName({
  value,
}: {
  value: string | number | null | undefined;
}): string {
  return value === BackupEngine.PGLITE
    ? t('PGlite')
    : value === BackupEngine.PG_DUMP
    ? t('PostgreSQL')
    : textOf({ value });
}

function textOf({
  value,
}: {
  value: string | number | null | undefined;
}): string {
  return value === null || value === undefined ? '' : String(value);
}

function numberOf({
  value,
}: {
  value: string | number | null | undefined;
}): number {
  return typeof value === 'number' ? value : 0;
}

export type CheckText = {
  title: string;
  detail: string | null;
};
