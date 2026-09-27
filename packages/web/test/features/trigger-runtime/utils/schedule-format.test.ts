import { describe, expect, it } from 'vitest';

import { scheduleFormat } from '@/features/trigger-runtime/utils/schedule-format';

describe('scheduleFormat.parseHolidayDates', () => {
  it('reads dates from pasted text and CSV rows, ignoring other columns', () => {
    const parsed = scheduleFormat.parseHolidayDates(
      'date,name\n2026-10-02,National Day\n2026/10/1\n2026-10-01\n2026-02-30',
    );
    expect(parsed.dates).toEqual(['2026-10-01', '2026-10-02']);
    expect(parsed.invalid).toEqual(['2026-02-30']);
  });

  it('returns nothing for empty input', () => {
    expect(scheduleFormat.parseHolidayDates('  ')).toEqual({
      dates: [],
      invalid: [],
    });
  });
});
