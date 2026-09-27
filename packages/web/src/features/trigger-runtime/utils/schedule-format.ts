import { scheduleUtils } from '@fema-ipaas/shared';

function fireTime({
  date,
  timezone,
}: {
  date: Date;
  timezone: string;
}): string {
  return formatterFor(timezone).format(date);
}

function parseHolidayDates(text: string): ParsedHolidayDates {
  const candidates = text
    .split(/[\s,;]+/)
    .map((token) => token.trim().replace(/\//g, '-'))
    .filter((token) => DATE_LIKE.test(token))
    .map((token) => normalizeDate(token));
  return {
    dates: [
      ...new Set(candidates.filter((date) => scheduleUtils.isValidDate(date))),
    ].sort(),
    invalid: [
      ...new Set(candidates.filter((date) => !scheduleUtils.isValidDate(date))),
    ],
  };
}

function normalizeDate(token: string): string {
  const [year, month, day] = token.split('-');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
}

const DATE_LIKE = /^\d{4}-\d{1,2}-\d{1,2}$/;

export const scheduleFormat = {
  fireTime,
  parseHolidayDates,
};

export type ParsedHolidayDates = {
  dates: string[];
  invalid: string[];
};
