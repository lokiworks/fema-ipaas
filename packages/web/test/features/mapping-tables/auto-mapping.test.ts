import { describe, expect, it } from 'vitest';

import { autoMapping } from '@/features/mapping-tables/utils/auto-mapping';

const sources = autoMapping.flattenSources({
  sampleData: {
    trigger: {
      body: {
        email: 'a@b.com',
        mobile: '13800000000',
        dept_name: '研发中心',
        profile: { full_name: '王磊' },
        items: [{ code: 'M-1' }],
      },
    },
  },
});

describe('autoMapping.flattenSources', () => {
  it('lists leaf paths with samples and keeps arrays whole', () => {
    expect(sources).toEqual([
      { path: 'trigger.body.email', sample: 'a@b.com' },
      { path: 'trigger.body.mobile', sample: '13800000000' },
      { path: 'trigger.body.dept_name', sample: '研发中心' },
      { path: 'trigger.body.profile.full_name', sample: '王磊' },
      { path: 'trigger.body.items', sample: '[{"code":"M-1"}]' },
    ]);
  });
});

describe('autoMapping.suggestByName', () => {
  it('scores exact, synonym and similar names like the design says', () => {
    const suggestions = autoMapping.suggestByName({
      targets: ['email', 'phone', 'department', 'emial', 'unrelated'],
      sources,
    });
    expect(suggestions).toEqual([
      { target: 'email', sourcePath: 'trigger.body.email', confidence: 0.95 },
      { target: 'phone', sourcePath: 'trigger.body.mobile', confidence: 0.88 },
      {
        target: 'department',
        sourcePath: 'trigger.body.dept_name',
        confidence: 0.88,
      },
      { target: 'emial', sourcePath: 'trigger.body.email', confidence: 0.55 },
    ]);
  });
});

describe('autoMapping.merge', () => {
  it('keeps the most confident suggestion per target', () => {
    expect(
      autoMapping.merge({
        byName: [{ target: 'a', sourcePath: 'x', confidence: 0.55 }],
        byModel: [
          { target: 'a', sourcePath: 'y', confidence: 0.9 },
          { target: 'b', sourcePath: 'z', confidence: 0.7 },
        ],
      }),
    ).toEqual([
      { target: 'a', sourcePath: 'y', confidence: 0.9 },
      { target: 'b', sourcePath: 'z', confidence: 0.7 },
    ]);
  });
});
