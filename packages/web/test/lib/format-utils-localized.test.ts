import { readFileSync } from 'fs';
import path from 'path';

import i18n from 'i18next';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatUtils } from '@/lib/format-utils';

describe('formatUtils.formatDateToAgo in Chinese', () => {
  beforeAll(async () => {
    const zh = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../public/locales/zh/translation.json'),
        'utf-8',
      ),
    );
    i18n.addResourceBundle('zh', 'translation', zh, true, true);
    await i18n.changeLanguage('zh');
  });

  afterAll(async () => {
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  it.each([
    ['2025-06-15T11:59:30Z', '30 秒前'],
    ['2025-06-15T11:55:00Z', '5 分钟前'],
    ['2025-06-15T09:00:00Z', '3 小时前'],
    ['2025-06-13T12:00:00Z', '2 天前'],
  ])('writes %s as %s', (iso, expected) => {
    expect(formatUtils.formatDateToAgo(new Date(iso))).toBe(expected);
  });

  it('writes dates older than thirty days in the Chinese date style', () => {
    expect(formatUtils.formatDateToAgo(new Date('2025-04-01T12:00:00Z'))).toBe(
      '2025年4月1日',
    );
  });
});
