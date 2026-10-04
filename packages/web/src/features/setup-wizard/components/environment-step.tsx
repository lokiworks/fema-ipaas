import {
  EncryptionKeySource,
  SetupCheck,
  SetupCheckKind,
  SetupCheckLevel,
  SetupStatus,
} from '@fema-ipaas/shared';
import { UseQueryResult } from '@tanstack/react-query';
import { t } from 'i18next';
import { RefreshCw } from 'lucide-react';

import { CopyToClipboardInput } from '@/components/custom/clipboard/copy-to-clipboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckLevel,
  CheckRow,
  DeploymentKind,
  systemRunbook,
} from '@/features/system';

import { AccessAddress } from '../utils/setup-wizard-utils';

export function EnvironmentStep({
  status,
  access,
}: {
  status: UseQueryResult<SetupStatus>;
  access: AccessAddress;
}) {
  if (status.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }
  if (status.isError || !status.data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('Could not read the environment')}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>
            {t(
              'The server did not answer. Check that it is running, then try again.',
            )}
          </span>
          <RecheckButton status={status} />
        </AlertDescription>
      </Alert>
    );
  }
  const rows = [
    ...status.data.checks.map((check) => rowOf({ check })),
    accessRow({ access }),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y rounded-lg border px-4">
        {rows.map((row) => (
          <CheckRow key={row.id} level={row.level} title={row.title}>
            <div className="flex flex-col gap-2">
              <span>{row.text}</span>
              {row.command && (
                <CopyToClipboardInput
                  useInput={!row.command.includes('\n')}
                  textToCopy={row.command}
                />
              )}
            </div>
          </CheckRow>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {t('Platform version {version}', {
            version: status.data.version ?? '',
          })}
        </span>
        <RecheckButton status={status} />
      </div>
    </div>
  );
}

function RecheckButton({ status }: { status: UseQueryResult<SetupStatus> }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={status.isFetching}
      onClick={() => status.refetch()}
    >
      <RefreshCw className="size-4" />
      {t('Check again')}
    </Button>
  );
}

function rowOf({ check }: { check: SetupCheck }): EnvironmentRow {
  const level = levelOf({ level: check.level });
  const ok = check.level === SetupCheckLevel.OK;
  switch (check.kind) {
    case SetupCheckKind.DATABASE:
      return {
        id: check.kind,
        level,
        title: 'PostgreSQL',
        text: ok
          ? t('Connected · {version}', { version: check.detail ?? '' })
          : t(
              'Cannot connect to the database. Check the FEMA_POSTGRES_* settings and that the database container is running.',
            ),
      };
    case SetupCheckKind.REDIS:
      return {
        id: check.kind,
        level,
        title: t('Queue'),
        text: ok
          ? t('Connected · {version}', { version: check.detail ?? '' })
          : t(
              'Cannot connect to Redis. Check the FEMA_REDIS_* settings and that the Redis container is running.',
            ),
      };
    case SetupCheckKind.ENCRYPTION_KEY:
      return encryptionKeyRow({ check, level });
    case SetupCheckKind.FILE_STORAGE:
      return {
        id: check.kind,
        level,
        title: t('Files'),
        text:
          check.detail === 'S3'
            ? t('Stored in object storage')
            : t('Stored in the database. Enough for a single app instance.'),
      };
    case SetupCheckKind.DATA_DIRECTORY:
      return dataDirectoryRow({ check, level });
    case SetupCheckKind.WORKERS:
      return {
        id: check.kind,
        level,
        title: t('Workers'),
        text: ok
          ? t('{count} online', { count: Number(check.detail ?? 0) })
          : t(
              'No worker is online yet, so workflows cannot run. The built-in worker usually connects within a minute. If it never does, look at its log:',
            ),
        command: ok ? undefined : 'docker compose logs worker',
      };
  }
}

function encryptionKeyRow({
  check,
  level,
}: {
  check: SetupCheck;
  level: CheckLevel;
}): EnvironmentRow {
  const base = { id: check.kind, level, title: t('Encryption key') };
  if (check.level === SetupCheckLevel.ERROR) {
    return {
      ...base,
      text: t(
        'No encryption key is configured. Set FEMA_ENCRYPTION_KEY to 32 hexadecimal characters and restart. This generates one:',
      ),
      command: 'openssl rand -hex 16',
    };
  }
  if (check.level === SetupCheckLevel.WARNING) {
    const settingsPath = check.detail ?? '';
    return {
      ...base,
      text: t(
        'Generated automatically and saved in {path}. Copy it out now and keep it apart from database backups; without it, saved connection credentials cannot be decrypted.',
        { path: settingsPath },
      ),
      command: systemRunbook.keyBackupCommand({
        kind: DeploymentKind.COMPOSE,
        keySource: EncryptionKeySource.GENERATED_FILE,
        keyPath: settingsPath.replace(/\/settings\.json$/, ''),
      }),
    };
  }
  return {
    ...base,
    text: t(
      'Set through FEMA_ENCRYPTION_KEY. Keep a copy apart from database backups.',
    ),
  };
}

function dataDirectoryRow({
  check,
  level,
}: {
  check: SetupCheck;
  level: CheckLevel;
}): EnvironmentRow {
  const path = check.detail ?? '';
  const base = { id: check.kind, level, title: t('Data directory') };
  if (check.level === SetupCheckLevel.OK) {
    return { ...base, text: t('Writable · {path}', { path }) };
  }
  return {
    ...base,
    text: t(
      'The platform cannot write to {path}. Fix the permissions on the server, then check again. If the directory belongs to another user, give it to the user that runs the platform with chown.',
      { path },
    ),
    command: `chmod -R u+rwX "${path}"`,
  };
}

function accessRow({ access }: { access: AccessAddress }): EnvironmentRow {
  const base = { id: 'ACCESS_ADDRESS', title: t('Access address') };
  if (access.mismatch) {
    return {
      ...base,
      level: 'warning',
      text: t(
        'You opened {current}, but the platform is set to {configured}. Links in emails and sign-in callbacks will point to {configured}. Set FEMA_FRONTEND_URL to {current} and restart.',
        { current: access.current ?? '', configured: access.configured ?? '' },
      ),
    };
  }
  if (access.insecure) {
    return {
      ...base,
      level: 'warning',
      text: t(
        'You are using plain http at {current}. Some browser features and third-party sign-in callbacks need HTTPS, so set it up before real use.',
        { current: access.current ?? '' },
      ),
    };
  }
  return { ...base, level: 'ok', text: access.current ?? '' };
}

function levelOf({ level }: { level: SetupCheckLevel }): CheckLevel {
  switch (level) {
    case SetupCheckLevel.OK:
      return 'ok';
    case SetupCheckLevel.WARNING:
      return 'warning';
    case SetupCheckLevel.ERROR:
      return 'error';
  }
}

type EnvironmentRow = {
  id: string;
  level: CheckLevel;
  title: string;
  text: string;
  command?: string;
};
