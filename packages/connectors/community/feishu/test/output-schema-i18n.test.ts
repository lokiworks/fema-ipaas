import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';
import type { OutputSchemaField } from '@fema-ipaas/connector-sdk';

import { feishuOutputSchemas } from '../src/lib/output-schemas';
import { APPROVAL_SCHEMA } from '../src/lib/actions/approvals';

const zh: Record<string, string> = JSON.parse(readFileSync(path.resolve(__dirname, '../src/i18n/zh.json'), 'utf-8'));

const texts = [...new Set(Object.values({ ...feishuOutputSchemas, approval: APPROVAL_SCHEMA }).flatMap((schema) => schema.fields.flatMap(textsOf)))];

function textsOf(field: OutputSchemaField): string[] {
  return [
    ...(field.label ? [field.label] : []),
    ...(field.description ? [field.description] : []),
    ...(field.children ?? []).flatMap(textsOf),
    ...(field.listItems ?? []).flatMap(textsOf),
  ];
}

describe('feishu output schema translations', () => {
  it('collects the output labels', () => {
    expect(texts.length).toBeGreaterThan(10);
  });

  it.each(texts)('has a Chinese translation for "%s"', (text) => {
    expect(zh[text]).toBeTruthy();
  });
});
