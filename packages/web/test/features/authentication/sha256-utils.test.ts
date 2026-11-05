import { createHash } from 'crypto';

import { describe, expect, it } from 'vitest';

import { sha256Utils } from '@/features/authentication/utils/sha256-utils';

function reference(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const SAMPLES = [
  '',
  'abc',
  'salt123',
  'a'.repeat(55),
  'a'.repeat(56),
  'a'.repeat(63),
  'a'.repeat(64),
  'a'.repeat(65),
  'b'.repeat(119),
  'c'.repeat(1000),
  'unicode-中文-é',
];

describe('sha256Utils', () => {
  it.each(SAMPLES)('matches the platform digest for %j', (sample) => {
    expect(sha256Utils.sha256HexSync(sample)).toBe(reference(sample));
  });

  it('matches the platform digest through the asynchronous entry point', async () => {
    expect(await sha256Utils.sha256Hex('abc')).toBe(reference('abc'));
  });
});
