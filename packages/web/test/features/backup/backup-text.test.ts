import {
  BackupEngine,
  RestoreCheck,
  RestoreCheckKind,
  RestoreCheckLevel,
} from '@fema-ipaas/shared';
import { describe, expect, it } from 'vitest';

import { backupText } from '@/features/backup/utils/backup-text';

function check({
  kind,
  level,
  params,
}: {
  kind: RestoreCheckKind;
  level: RestoreCheckLevel;
  params: RestoreCheck['params'];
}): RestoreCheck {
  return { kind, level, params };
}

describe('backupText.checkLevel', () => {
  it('maps restore check levels to check row levels', () => {
    expect(backupText.checkLevel({ level: RestoreCheckLevel.OK })).toBe('ok');
    expect(backupText.checkLevel({ level: RestoreCheckLevel.WARNING })).toBe(
      'warning',
    );
    expect(backupText.checkLevel({ level: RestoreCheckLevel.ERROR })).toBe(
      'error',
    );
  });
});

describe('backupText.checkText', () => {
  it('says a changed file may be damaged when the checksum differs', () => {
    const text = backupText.checkText({
      check: check({
        kind: RestoreCheckKind.CHECKSUM,
        level: RestoreCheckLevel.ERROR,
        params: { expected: 'a', actual: 'b' },
      }),
    });
    expect(text.title).toBe('Checksum does not match');
    expect(text.detail).toContain('Do not restore it');
  });

  it('tells a newer backup apart from an older one', () => {
    const newer = backupText.checkText({
      check: check({
        kind: RestoreCheckKind.VERSION,
        level: RestoreCheckLevel.ERROR,
        params: {
          backupVersion: '9.9.9',
          currentVersion: '0.88.3',
          relation: 'newer',
        },
      }),
    });
    const older = backupText.checkText({
      check: check({
        kind: RestoreCheckKind.VERSION,
        level: RestoreCheckLevel.WARNING,
        params: {
          backupVersion: '0.80.0',
          currentVersion: '0.88.3',
          relation: 'older',
        },
      }),
    });
    expect(newer.title).toBe('The backup is from a newer version');
    expect(older.title).toBe('The backup is from an older version');
  });

  it('explains which key made the backup when the fingerprints differ', () => {
    const text = backupText.checkText({
      check: check({
        kind: RestoreCheckKind.ENCRYPTION_KEY,
        level: RestoreCheckLevel.WARNING,
        params: {
          backup: 'deadbeef',
          current: '3eb1bd43',
          relation: 'different',
        },
      }),
    });
    expect(text.title).toBe(
      'The encryption key is not the one that made the backup',
    );
    expect(text.detail).toContain('deadbeef');
    expect(text.detail).toContain('3eb1bd43');
  });

  it('names the engines when they differ', () => {
    const text = backupText.checkText({
      check: check({
        kind: RestoreCheckKind.ENGINE,
        level: RestoreCheckLevel.ERROR,
        params: { backup: BackupEngine.PGLITE, current: BackupEngine.PG_DUMP },
      }),
    });
    expect(text.detail).toContain('PGlite');
    expect(text.detail).toContain('PostgreSQL');
  });
});
