import { describe, expect, it } from 'vitest';

import { fullNameUtils } from '@/features/authentication/utils/full-name-utils';

describe('fullNameUtils.normalize', () => {
  it.each([
    ['林晓', '林晓'],
    ['林 晓', '林晓'],
    ['  林   晓  ', '林晓'],
    ['Ahmad   Tash', 'Ahmad Tash'],
    ['  Ahmad ', 'Ahmad'],
    ['Li 晓', 'Li晓'],
  ])('turns %s into %s', (input, expected) => {
    expect(fullNameUtils.normalize(input)).toBe(expected);
  });
});
