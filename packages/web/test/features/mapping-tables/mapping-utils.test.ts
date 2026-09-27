import { describe, expect, it } from 'vitest';

import {
  ImportMode,
  ImportRowStatus,
  ImportSkipReason,
  mappingCsv,
} from '@/features/mapping-tables/utils/csv-utils';
import { templatePreview } from '@/features/mapping-tables/utils/template-preview';

describe('mappingCsv', () => {
  it('parses delimiters, quotes and a header row', () => {
    const parsed = mappingCsv.parse({
      text: '﻿北森部门,飞书部门 ID\n研发中心,od-rd-001\n"销售, 运营",od-sales-002\n',
    });
    expect(parsed.hasHeader).toBe(true);
    expect(parsed.rows).toEqual([
      { k: '研发中心', v: 'od-rd-001' },
      { k: '销售, 运营', v: 'od-sales-002' },
    ]);
  });

  it('detects tabs and Chinese commas', () => {
    expect(mappingCsv.parse({ text: 'a\t1\nb\t2' }).rows).toEqual([
      { k: 'a', v: '1' },
      { k: 'b', v: '2' },
    ]);
    expect(mappingCsv.parse({ text: 'a，1' }).rows).toEqual([
      { k: 'a', v: '1' },
    ]);
  });

  it('round-trips through serialize', () => {
    const rows = [{ k: 'x,y', v: 'say "hi"' }];
    const text = mappingCsv.serialize({
      rows,
      keyLabel: 'key',
      valueLabel: 'value',
    });
    expect(mappingCsv.parse({ text, labels: ['key', 'value'] }).rows).toEqual(
      rows,
    );
  });

  it('previews a merge with added, updated, unchanged and skipped rows', () => {
    const preview = mappingCsv.merge({
      current: [
        { k: 'a', v: '1' },
        { k: 'b', v: '2' },
      ],
      incoming: [
        { k: 'a', v: '1' },
        { k: 'b', v: '3' },
        { k: 'c', v: '4' },
        { k: '', v: '5' },
        { k: 'c', v: '6' },
      ],
      mode: ImportMode.MERGE,
    });
    expect(preview.outcomes.map((outcome) => outcome.status)).toEqual([
      ImportRowStatus.UNCHANGED,
      ImportRowStatus.UPDATED,
      ImportRowStatus.SKIPPED,
      ImportRowStatus.SKIPPED,
      ImportRowStatus.ADDED,
    ]);
    expect(preview.outcomes[2].reason).toBe(ImportSkipReason.DUPLICATE);
    expect(preview.outcomes[3].reason).toBe(ImportSkipReason.EMPTY_KEY);
    expect(preview.result).toEqual([
      { k: 'a', v: '1' },
      { k: 'b', v: '3' },
      { k: 'c', v: '6' },
    ]);
  });

  it('lists removed rows when replacing', () => {
    const preview = mappingCsv.merge({
      current: [{ k: 'old', v: '1' }],
      incoming: [{ k: 'new', v: '2' }],
      mode: ImportMode.REPLACE,
    });
    expect(preview.result).toEqual([{ k: 'new', v: '2' }]);
    expect(preview.removed).toEqual([{ k: 'old', v: '1' }]);
  });
});

describe('templatePreview.resolveTemplate', () => {
  const sampleData = {
    trigger: { body: { name: '王磊', items: [{ code: 'M-1' }] } },
  };

  it('returns raw values for a single reference', () => {
    expect(
      templatePreview.resolveTemplate({
        template: '{{trigger.body.items}}',
        sampleData,
      }),
    ).toEqual([{ code: 'M-1' }]);
  });

  it('interpolates references inside text', () => {
    expect(
      templatePreview.resolveTemplate({
        template: '你好 {{trigger.body.name}}',
        sampleData,
      }),
    ).toBe('你好 王磊');
  });

  it('keeps constants as they are', () => {
    expect(
      templatePreview.resolveTemplate({ template: 'Web', sampleData }),
    ).toBe('Web');
  });
});
