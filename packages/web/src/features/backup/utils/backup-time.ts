import { BackupSettings } from '@fema-ipaas/shared';

import { formatUtils } from '@/lib/format-utils';

function local({ iso }: { iso: string }): string {
  return formatUtils.formatDateWithTime(new Date(iso), false);
}

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function planShiftMinutes({
  serverZone,
  at,
}: {
  serverZone: string;
  at: Date;
}): number | null {
  const serverOffset = zoneOffsetMinutes({ zone: serverZone, at });
  if (serverOffset === null) {
    return null;
  }
  const shift = -at.getTimezoneOffset() - serverOffset;
  return shift % 60 === 0 ? shift : null;
}

function shiftPlan<T extends Pick<BackupSettings, 'weekday' | 'hour'>>({
  plan,
  minutes,
}: {
  plan: T;
  minutes: number;
}): T {
  const shifted =
    (((plan.weekday * DAY_MINUTES + plan.hour * 60 + minutes) % WEEK_MINUTES) +
      WEEK_MINUTES) %
    WEEK_MINUTES;
  return {
    ...plan,
    weekday: Math.floor(shifted / DAY_MINUTES),
    hour: Math.floor((shifted % DAY_MINUTES) / 60),
  };
}

function zoneOffsetMinutes({
  zone,
  at,
}: {
  zone: string;
  at: Date;
}): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const valueOf = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');
    const wallAsUtc = Date.UTC(
      valueOf('year'),
      valueOf('month') - 1,
      valueOf('day'),
      valueOf('hour') % 24,
      valueOf('minute'),
    );
    const instant = Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS;
    return Math.round((wallAsUtc - instant) / MINUTE_MS);
  } catch {
    return null;
  }
}

const MINUTE_MS = 60 * 1000;
const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;

export const backupTime = {
  local,
  localZone,
  planShiftMinutes,
  shiftPlan,
};
