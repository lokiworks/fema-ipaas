import { EncryptionKeySource, FileLocation } from '@fema-ipaas/shared';
import { t } from 'i18next';

export const systemRunbook = {
  upgradeSteps,
  rollbackSteps,
  backupSteps,
  restoreSteps,
  scheduleCommand,
  keyBackupCommand,
  isVersionSkewed,
  containerTypeLabel,
};

function containerTypeLabel({
  containerType,
}: {
  containerType: string | null;
}): string {
  switch (containerType) {
    case null:
    case 'WORKER_AND_APP':
      return t('App and worker in one container');
    case 'APP':
      return t('App container only');
    case 'WORKER':
      return t('Worker container only');
    default:
      return containerType;
  }
}

function upgradeSteps({
  kind,
  targetVersion,
}: {
  kind: DeploymentKind;
  targetVersion: string;
}): RunbookStep[] {
  if (kind === DeploymentKind.HELM) {
    return [
      {
        id: 'backup',
        title: t('Back up the database'),
        description: t(
          'Migrations cannot be undone. This backup is your rollback point.',
        ),
        command: databaseBackupCommand({ kind }),
      },
      {
        id: 'upgrade',
        title: t('Upgrade the release'),
        description: t(
          'Database migrations run when the new version starts. The service is unavailable while they run, usually 1 to 3 minutes.',
        ),
        command: `helm upgrade fema ./deploy/fema-helm -n fema \\\n  --reuse-values --set image.tag=${targetVersion} \\\n  --wait --timeout 10m`,
      },
      {
        id: 'verify',
        title: t('Confirm the rollout and migrations finished'),
        command: `kubectl -n fema rollout status deployment/fema\nkubectl -n fema logs deployment/fema | grep -i migration`,
      },
      {
        id: 'workers',
        title: t('Upgrade workers outside the cluster'),
        description: t(
          'Workers on a different version do not pick up jobs. Recreate them with the same image version.',
        ),
        command: `docker pull ${IMAGE}:${targetVersion}`,
      },
    ];
  }
  return [
    {
      id: 'backup',
      title: t('Back up the database'),
      description: t(
        'Migrations cannot be undone. This backup is your rollback point.',
      ),
      command: databaseBackupCommand({ kind }),
    },
    {
      id: 'image',
      title: t('Point the app and workers at the new image'),
      command: `cd ${COMPOSE_DIR}\nsed -i.bak 's#${IMAGE}:[^[:space:]]*#${IMAGE}:${targetVersion}#' docker-compose.yml`,
    },
    {
      id: 'pull',
      title: t('Pull the new image'),
      command: 'docker compose pull app worker',
    },
    {
      id: 'restart',
      title: t('Restart the services'),
      description: t(
        'Database migrations run when the new version starts. The service is unavailable while they run, usually 1 to 3 minutes.',
      ),
      command: 'docker compose up -d',
    },
    {
      id: 'verify',
      title: t('Confirm the migrations finished'),
      command: 'docker compose logs app | grep -i migration',
    },
  ];
}

function rollbackSteps({
  kind,
  currentVersion,
}: {
  kind: DeploymentKind;
  currentVersion: string;
}): RunbookStep[] {
  if (kind === DeploymentKind.HELM) {
    return [
      {
        id: 'stop',
        title: t('Stop the app and workers'),
        command: 'kubectl -n fema scale deployment/fema --replicas=0',
      },
      {
        id: 'restore',
        title: t('Restore the backup taken before the upgrade'),
        command: databaseRestoreCommand({ kind }),
      },
      {
        id: 'start',
        title: t('Start the previous version'),
        command: `helm upgrade fema ./deploy/fema-helm -n fema \\\n  --reuse-values --set image.tag=${currentVersion} --wait`,
      },
    ];
  }
  return [
    {
      id: 'stop',
      title: t('Stop the app and workers'),
      command: 'docker compose stop app worker',
    },
    {
      id: 'image',
      title: t('Point the app and workers back at the previous image'),
      command: `sed -i.bak 's#${IMAGE}:[^[:space:]]*#${IMAGE}:${currentVersion}#' docker-compose.yml`,
    },
    {
      id: 'restore',
      title: t('Restore the backup taken before the upgrade'),
      command: databaseRestoreCommand({ kind }),
    },
    {
      id: 'start',
      title: t('Start the services'),
      command: 'docker compose up -d',
    },
  ];
}

function backupSteps({
  kind,
  keySource,
  keyPath,
  fileLocation,
}: BackupContext): RunbookStep[] {
  return [
    {
      id: 'database',
      title: t('Back up the database'),
      description:
        fileLocation === FileLocation.S3
          ? t(
              'Includes workflows, runs, connections and settings. Uploaded files live in object storage; turn on bucket versioning to keep them recoverable.',
            )
          : t(
              'Includes workflows, runs, connections, settings and uploaded files, which are stored in the database.',
            ),
      command: databaseBackupCommand({ kind }),
    },
    {
      id: 'key',
      title: t('Save the encryption key separately'),
      description: t(
        'Connection credentials cannot be decrypted without it. Keep it apart from the database backup, for example in a password manager.',
      ),
      command: keyBackupCommand({ kind, keySource, keyPath }),
    },
  ];
}

function restoreSteps({
  kind,
  keySource,
  keyPath,
}: Omit<BackupContext, 'fileLocation'>): RunbookStep[] {
  const stop =
    kind === DeploymentKind.HELM
      ? 'kubectl -n fema scale deployment/fema --replicas=0'
      : 'docker compose stop app worker';
  const start =
    kind === DeploymentKind.HELM
      ? 'kubectl -n fema scale deployment/fema --replicas=1'
      : 'docker compose up -d';
  return [
    {
      id: 'stop',
      title: t('Stop the app and workers'),
      description: t(
        'Nothing may write to the database while it is being restored.',
      ),
      command: stop,
    },
    {
      id: 'restore',
      title: t('Restore the database'),
      description: t(
        'Run the same version that made the backup. A newer version migrates the restored data when it starts.',
      ),
      command: databaseRestoreCommand({ kind }),
    },
    {
      id: 'key',
      title: t(
        'Put back the encryption key that was used when the backup was made',
      ),
      description:
        keySource === EncryptionKeySource.GENERATED_FILE
          ? t('Copy the saved settings file back to {path}.', {
              path: keyPath ?? DEFAULT_CONFIG_PATH,
            })
          : t('Set FEMA_ENCRYPTION_KEY to the saved value.'),
    },
    {
      id: 'start',
      title: t('Start the services'),
      command: start,
    },
  ];
}

function scheduleCommand({ keepDays }: { keepDays: number }): string {
  return `0 2 * * * cd ${COMPOSE_DIR} && mkdir -p backups && docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/fema-$(date +\\%Y\\%m\\%d).dump && find backups -name 'fema-*.dump' -mtime +${keepDays} -delete`;
}

function keyBackupCommand({
  kind,
  keySource,
  keyPath,
}: Omit<BackupContext, 'fileLocation'>): string {
  if (kind === DeploymentKind.HELM) {
    return `kubectl -n fema get secret fema-secrets \\\n  -o jsonpath='{.data.encryption-key}' | base64 -d > encryption-key.txt`;
  }
  if (keySource === EncryptionKeySource.GENERATED_FILE) {
    return `docker compose cp app:${
      keyPath ?? DEFAULT_CONFIG_PATH
    }/settings.json ./fema-settings.json`;
  }
  return `grep -E '^FEMA_(ENCRYPTION_KEY|RETIRED_ENCRYPTION_KEYS)=' .env > encryption-key.txt`;
}

function isVersionSkewed({
  current,
  workerVersions,
}: {
  current: string;
  workerVersions: string[];
}): boolean {
  return workerVersions.some((version) => version !== current);
}

function databaseBackupCommand({ kind }: { kind: DeploymentKind }): string {
  if (kind === DeploymentKind.HELM) {
    return `pg_dump "$FEMA_POSTGRES_URL" -Fc -f fema-$(date +%Y%m%d-%H%M).dump`;
  }
  return `docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \\\n  > fema-$(date +%Y%m%d-%H%M).dump`;
}

function databaseRestoreCommand({ kind }: { kind: DeploymentKind }): string {
  if (kind === DeploymentKind.HELM) {
    return `pg_restore -d "$FEMA_POSTGRES_URL" --clean --if-exists fema-<date>.dump`;
  }
  return `docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \\\n  < fema-<date>.dump`;
}

const IMAGE = 'ghcr.io/lokiworks/fema-ipaas';
const COMPOSE_DIR = '/opt/fema';
const DEFAULT_CONFIG_PATH = '/root/.fema';

export enum DeploymentKind {
  COMPOSE = 'COMPOSE',
  HELM = 'HELM',
}

export type RunbookStep = {
  id: string;
  title: string;
  description?: string;
  command?: string;
};

type BackupContext = {
  kind: DeploymentKind;
  keySource: EncryptionKeySource;
  keyPath: string | null;
  fileLocation: string | null;
};
