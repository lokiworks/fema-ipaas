import { describe, expect, it } from 'vitest';

import { personName } from '@/lib/person-name';

describe('personName', () => {
  it('puts the family name first without a space for Chinese names', () => {
    expect(
      personName.format({
        firstName: '晓',
        lastName: '林',
        language: 'zh-CN',
      }),
    ).toBe('林晓');
  });

  it('keeps Chinese order even when the interface language is English', () => {
    expect(
      personName.format({
        firstName: '晓',
        lastName: '林',
        language: 'en',
      }),
    ).toBe('林晓');
  });

  it('puts the given name first with a space for English names', () => {
    expect(
      personName.format({
        firstName: 'Ada',
        lastName: 'Lovelace',
        language: 'en',
      }),
    ).toBe('Ada Lovelace');
  });

  it('keeps Latin names readable in the Chinese interface', () => {
    expect(
      personName.format({
        firstName: 'Ada',
        lastName: 'Lovelace',
        language: 'zh-CN',
      }),
    ).toBe('Ada Lovelace');
  });

  it('drops the placeholder last name and empty parts', () => {
    expect(
      personName.format({ firstName: '张三', lastName: '-', language: 'zh' }),
    ).toBe('张三');
    expect(
      personName.format({
        firstName: null,
        lastName: undefined,
        language: 'en',
      }),
    ).toBe('');
  });

  it('falls back when the name is empty', () => {
    expect(
      personName.formatWithFallback({
        firstName: '',
        lastName: '',
        fallback: 'a@b.test',
      }),
    ).toBe('a@b.test');
  });
});
