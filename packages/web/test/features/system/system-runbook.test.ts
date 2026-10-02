import { EncryptionKeySource, FileLocation } from '@fema-ipaas/shared';
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
