import { readFileSync } from 'fs';
import path from 'path';

import type { OutputSchemaField } from '@fema-ipaas/connector-sdk';
import { describe, expect, it } from 'vitest';

import { femaOutputSchemas } from '../src/lib/output-schemas';

const zh: Record<string, string> = JSON.parse(readFileSync(path.resolve(__dirname, '../src/i18n/zh.json'), 'utf-8'));
const en: Record<string, string> = JSON.parse(readFileSync(path.resolve(__dirname, '../src/i18n/translation.json'), 'utf-8'));

const texts = [...new Set(Object.values(femaOutputSchemas).flatMap((schema) => schema.fields.flatMap(textsOf)))];

function textsOf(field: OutputSchemaField): string[] {
  return [
    ...(field.label ? [field.label] : []),
    ...(field.description ? [field.description] : []),
    ...(field.children ?? []).flatMap(textsOf),
    ...(field.listItems ?? []).flatMap(textsOf),
  ];
}

describe('fema translations', () => {
  it.each(texts)('has a Chinese translation for "%s"', (text) => {
    expect(zh[text]).toBeTruthy();
  });

  it('keeps the English file identity-mapped with the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    expect(Object.entries(en).every(([key, value]) => key === value)).toBe(true);
  });
});
