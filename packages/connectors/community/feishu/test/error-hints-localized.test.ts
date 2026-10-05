import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import { feishuErrorTable } from '../src/lib/common/error-table';

const failureText = readFileSync(path.resolve(__dirname, '../../../../web/src/features/issues/utils/failure-text.ts'), 'utf-8');

const errorCodes = [...readFileSync(path.resolve(__dirname, '../src/lib/common/error-table.ts'), 'utf-8').matchAll(/^ {2}(\d+): \{/gm)].map((match) => Number(match[1]));

describe('feishu error hints', () => {
  it('lists the error codes it maps', () => {
    expect(errorCodes.length).toBeGreaterThan(50);
  });

  it.each(errorCodes)('has a translation entry in the web failure text for code %i', (code) => {
    const hint = feishuErrorTable.ruleFor({ code })?.hint ?? '';
    const quoted = [`'${hint.replace(/'/g, "\\'")}'`, `"${hint}"`];

    expect(hint).not.toBe('');
    expect(quoted.some((candidate) => failureText.includes(candidate))).toBe(true);
  });
});
