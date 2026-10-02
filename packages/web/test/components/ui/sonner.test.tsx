import { readFileSync } from 'fs';
import path from 'path';

import i18n from 'i18next';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({
  toast: { error: toastError },
  Toaster: () => null,
}));

vi.mock('@/components/providers/theme-provider', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

import {
  internalErrorToast,
  unsavedChangesToast,
} from '@/components/ui/sonner';

describe('error toasts follow the interface language', () => {
  beforeAll(async () => {
    const zh = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../../public/locales/zh/translation.json'),
        'utf-8',
      ),
    );
    i18n.addResourceBundle('zh', 'translation', zh, true, true);
    await i18n.changeLanguage('zh');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates the generic failure toast', () => {
    internalErrorToast();
    expect(toastError).toHaveBeenLastCalledWith('出了点问题', {
      description: '发生了意外错误，请稍后再试。',
      duration: 3000,
    });
  });

  it('translates the unsaved changes toast', () => {
    unsavedChangesToast();
    const [title, options] = toastError.mock.lastCall ?? [];
    expect(title).toBe('有未保存的修改');
    expect(options.description).toContain('未保存的修改');
    expect(options.id).toBe('unsaved-changes');
    expect(options.duration).toBe(Infinity);
  });
});
