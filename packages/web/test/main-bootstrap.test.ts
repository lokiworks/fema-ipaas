import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const MAIN_SOURCE = readFileSync(
  path.resolve(__dirname, '../src/main.tsx'),
  'utf-8',
);

describe('main bootstrap', () => {
  it('starts i18next before the application modules are evaluated', () => {
    const i18nImport = MAIN_SOURCE.search(/from '@\/i18n'|from '\.\/i18n'/);
    const appImport = MAIN_SOURCE.search(/from '\.\/app\/app'/);

    expect(i18nImport).toBeGreaterThan(-1);
    expect(appImport).toBeGreaterThan(-1);
    expect(i18nImport).toBeLessThan(appImport);
  });
});
