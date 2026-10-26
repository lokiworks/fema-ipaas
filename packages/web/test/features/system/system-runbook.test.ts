import {
  BackupEngine,
  EncryptionKeySource,
  FileLocation,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import {
  DeploymentKind,
  systemRunbook,
} from '@/features/system/utils/system-runbook';

describe('systemRunbook.upgradeSteps', () => {
  it('backs up before switching the compose image to the target version', () => {
    const steps = systemRunbook.upgradeSteps({
      kind: DeploymentKind.COMPOSE,
      targetVersion: '0.90.0',
    });
    expect(steps[0].id).toBe('backup');
    expect(steps[0].command).toContain('pg_dump');
    const image = steps.find((step) => step.id === 'image');
    expect(image?.command).toContain('ghcr.io/lokiworks/fema-ipaas:0.90.0');
  });

  it('upgrades the helm release with the target image tag', () => {
    const steps = systemRunbook.upgradeSteps({
      kind: DeploymentKind.HELM,
      targetVersion: '0.90.0',
    });
    const upgrade = steps.find((step) => step.id === 'upgrade');
    expect(upgrade?.command).toContain('--set image.tag=0.90.0');
  });
});

describe('systemRunbook.rollbackSteps', () => {
  it('restores the backup and returns to the running version', () => {
    const steps = systemRunbook.rollbackSteps({
      kind: DeploymentKind.COMPOSE,
      currentVersion: '0.89.0',
    });
    expect(steps.map((step) => step.id)).toEqual([
      'stop',
      'image',
      'restore',
      'start',
    ]);
    expect(steps[1].command).toContain('fema-ipaas:0.89.0');
    expect(steps[2].command).toContain('pg_restore');
  });
});

describe('systemRunbook.keyBackupCommand', () => {
  it('copies the generated settings file out of the app container', () => {
    expect(
      systemRunbook.keyBackupCommand({
        kind: DeploymentKind.COMPOSE,
        keySource: EncryptionKeySource.GENERATED_FILE,
        keyPath: '/root/.fema',
      }),
    ).toBe(
      'docker compose cp app:/root/.fema/settings.json ./fema-settings.json',
    );
  });

  it('reads the key from the env file when it is set there', () => {
    expect(
      systemRunbook.keyBackupCommand({
        kind: DeploymentKind.COMPOSE,
        keySource: EncryptionKeySource.ENVIRONMENT,
        keyPath: null,
      }),
    ).toContain('FEMA_(ENCRYPTION_KEY|RETIRED_ENCRYPTION_KEYS)');
  });

  it('reads the generated kubernetes secret on helm', () => {
    expect(
      systemRunbook.keyBackupCommand({
        kind: DeploymentKind.HELM,
        keySource: EncryptionKeySource.ENVIRONMENT,
        keyPath: null,
      }),
    ).toContain('fema-secrets');
  });
});

describe('systemRunbook.backupSteps', () => {
  it('backs up the database and the key', () => {
    const steps = systemRunbook.backupSteps({
      kind: DeploymentKind.COMPOSE,
      keySource: EncryptionKeySource.ENVIRONMENT,
      keyPath: null,
      fileLocation: FileLocation.DB,
    });
    expect(steps.map((step) => step.id)).toEqual(['database', 'key']);
  });
});

describe('systemRunbook.scheduleCommand', () => {
  it('escapes percent signs for cron and prunes by the retention', () => {
    const command = systemRunbook.scheduleCommand({ keepDays: 14 });
    expect(command).toContain('date +\\%Y\\%m\\%d');
    expect(command).toContain('-mtime +14 -delete');
    expect(command.startsWith('0 2 * * * ')).toBe(true);
  });
});

describe('systemRunbook.isVersionSkewed', () => {
  it('flags workers on another version', () => {
    expect(
      systemRunbook.isVersionSkewed({
        current: '0.89.0',
        workerVersions: ['0.89.0', '0.88.3'],
      }),
    ).toBe(true);
    expect(
      systemRunbook.isVersionSkewed({
        current: '0.89.0',
        workerVersions: ['0.89.0'],
      }),
    ).toBe(false);
  });
});

describe('systemRunbook.containerTypeLabel', () => {
  it('describes every container type the server can report in words', () => {
    expect(systemRunbook.containerTypeLabel({ containerType: null })).toBe(
      'App and worker in one container',
    );
    expect(
      systemRunbook.containerTypeLabel({ containerType: 'WORKER_AND_APP' }),
    ).toBe('App and worker in one container');
    expect(systemRunbook.containerTypeLabel({ containerType: 'APP' })).toBe(
      'App container only',
    );
    expect(systemRunbook.containerTypeLabel({ containerType: 'WORKER' })).toBe(
      'Worker container only',
    );
  });

  it('shows an unknown container type as reported instead of hiding it', () => {
    expect(systemRunbook.containerTypeLabel({ containerType: 'SIDECAR' })).toBe(
      'SIDECAR',
    );
  });
});

describe('systemRunbook.restoreFromBackupSteps', () => {
  const context = {
    directory: '/root/.fema/backups',
    dataDirectory: '/root/.fema',
    fileName: 'fema-20261004-020000-abc123.dump',
    keyDiffers: false,
  };

  it('stops services and runs the checked offline command on Compose', () => {
    const steps = systemRunbook.restoreFromBackupSteps({ ...context, kind: DeploymentKind.COMPOSE, engine: BackupEngine.PG_DUMP });
    expect(steps.map((step) => step.id)).toEqual(['stop', 'check', 'restore', 'start', 'reconcile']);
    expect(steps[1].command).toContain('fema-restore');
    expect(steps[1].command).toContain('--offline --check');
    expect(steps[2].command).toContain("'/root/.fema/backups/fema-20261004-020000-abc123.dump' --offline");
  });

  it('runs the same checked command in a Helm maintenance pod', () => {
    const steps = systemRunbook.restoreFromBackupSteps({ ...context, kind: DeploymentKind.HELM, engine: BackupEngine.PG_DUMP });
    expect(steps[0].command).toContain('--replicas=0');
    expect(steps.find((step) => step.id === 'restore')?.command).toContain('fema-restore');
  });

  it('uses the PGlite restore command instead of replacing a live directory', () => {
    const steps = systemRunbook.restoreFromBackupSteps({ ...context, fileName: 'backup.pglite.tar.gz', kind: DeploymentKind.COMPOSE, engine: BackupEngine.PGLITE });
    expect(steps[0].command).toBe('docker compose stop app worker');
    expect(steps.find((step) => step.id === 'restore')?.command).toContain('backup.pglite.tar.gz');
    expect(steps.find((step) => step.id === 'restore')?.command).toContain('--offline');
  });

  it('adds the key step only when the key differs', () => {
    const withKey = systemRunbook.restoreFromBackupSteps({
      ...context,
      keyDiffers: true,
      kind: DeploymentKind.COMPOSE,
      engine: BackupEngine.PG_DUMP,
    });
    expect(withKey.some((step) => step.id === 'key')).toBe(true);
  });
});
