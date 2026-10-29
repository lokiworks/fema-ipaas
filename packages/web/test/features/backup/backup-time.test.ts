import { describe, expect, it } from 'vitest';

import { backupTime } from '@/features/backup/utils/backup-time';

describe('backupTime.shiftPlan', () => {
  it('moves a weekly plan across midnight into the next weekday', () => {
    expect(
      backupTime.shiftPlan({ plan: { weekday: 0, hour: 18 }, minutes: 480 }),
    ).toEqual({ weekday: 1, hour: 2 });
  });

  it('wraps a Sunday plan back to Saturday', () => {
    expect(
      backupTime.shiftPlan({ plan: { weekday: 0, hour: 2 }, minutes: -480 }),
    ).toEqual({ weekday: 6, hour: 18 });
  });

  it('round-trips to the same server plan', () => {
    const local = backupTime.shiftPlan({
      plan: { weekday: 3, hour: 23 },
      minutes: 480,
    });
    expect(backupTime.shiftPlan({ plan: local, minutes: -480 })).toEqual({
      weekday: 3,
      hour: 23,
    });
  });

  it('keeps the other settings untouched', () => {
    expect(
      backupTime.shiftPlan({
        plan: { weekday: 1, hour: 2, keep: 7 },
        minutes: 60,
      }),
    ).toEqual({ weekday: 1, hour: 3, keep: 7 });
  });
});

describe('backupTime.planShiftMinutes', () => {
  it('returns no shift when the server zone matches the browser zone', () => {
    expect(
      backupTime.planShiftMinutes({
        serverZone: backupTime.localZone(),
        at: new Date('2026-10-30T00:00:00Z'),
      }),
    ).toBe(0);
  });

  it('gives up on an unknown zone', () => {
    expect(
      backupTime.planShiftMinutes({
        serverZone: 'Not/AZone',
        at: new Date('2026-10-30T00:00:00Z'),
      }),
    ).toBeNull();
  });
});
