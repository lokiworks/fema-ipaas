import {
  MappingFieldType,
  MappingTransformType,
} from '@fema-ipaas/core-utils';
import { describe, expect, it } from 'vitest';

import {
  autoMapping,
  MappingSuggestionBasis,
} from '@/features/mapping-tables/utils/auto-mapping';

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
      { path: 'trigger.body.email', sample: 'a@b.com', valueType: 'string' },
      {
        path: 'trigger.body.mobile',
        sample: '13800000000',
        valueType: 'string',
      },
      {
        path: 'trigger.body.dept_name',
        sample: '研发中心',
        valueType: 'string',
      },
      {
        path: 'trigger.body.profile.full_name',
        sample: '王磊',
        valueType: 'string',
      },
      {
        path: 'trigger.body.items',
        sample: '[{"code":"M-1"}]',
        valueType: 'array',
      },
    ]);
  });
});

describe('autoMapping.flattenSources transport noise', () => {
  it('leaves out webhook headers and the raw body so they are never suggested', () => {
    const flattened = autoMapping.flattenSources({
      sampleData: {
        trigger: {
          headers: { 'sec-ch-ua-mobile': '?0' },
          rawBody: '{"mobile":"1"}',
          body: { mobile: '138' },
        },
      },
    });
    expect(flattened.map((source) => source.path)).toEqual([
      'trigger.body.mobile',
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
      {
        target: 'email',
        sourcePath: 'trigger.body.email',
        confidence: 0.95,
        basis: MappingSuggestionBasis.SAME_NAME,
      },
      {
        target: 'phone',
        sourcePath: 'trigger.body.mobile',
        confidence: 0.88,
        basis: MappingSuggestionBasis.SYNONYM,
      },
      {
        target: 'department',
        sourcePath: 'trigger.body.dept_name',
        confidence: 0.88,
        basis: MappingSuggestionBasis.SYNONYM,
      },
      {
        target: 'emial',
        sourcePath: 'trigger.body.email',
        confidence: 0.55,
        basis: MappingSuggestionBasis.SIMILAR_NAME,
      },
    ]);
  });

  it('also matches the Chinese label of a target field', () => {
    expect(
      autoMapping.suggestByName({
        targets: ['mobile'],
        labels: { mobile: '手机号' },
        sources: autoMapping.flattenSources({
          sampleData: { trigger: { body: { 手机号: '13800000000' } } },
        }),
      })[0]?.sourcePath,
    ).toBe('trigger.body.手机号');
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

describe('autoMapping.sourceTemplate', () => {
  it('writes the reference form the engine resolves, with the output segment', () => {
    expect(autoMapping.sourceTemplate('trigger.body.email')).toBe(
      "{{trigger['output']['body']['email']}}",
    );
  });
});

describe('autoMapping.coercion', () => {
  it('adds the transform that makes the sample fit the target type', () => {
    expect(
      autoMapping.coercion({
        targetType: MappingFieldType.NUMBER,
        valueType: 'string',
        sample: '1,280',
      }),
    ).toEqual([{ type: MappingTransformType.NUMBER }]);
    expect(
      autoMapping.coercion({
        targetType: MappingFieldType.STRING,
        valueType: 'number',
        sample: '20301',
      }),
    ).toEqual([{ type: MappingTransformType.STRING }]);
    expect(
      autoMapping.coercion({
        targetType: MappingFieldType.DATE,
        valueType: 'string',
        sample: '2026/10/08',
      }),
    ).toEqual([{ type: MappingTransformType.DATE, arg: 'YYYY-MM-DD' }]);
    expect(
      autoMapping.coercion({
        targetType: MappingFieldType.NUMBER,
        valueType: 'string',
        sample: 'abc',
      }),
    ).toEqual([]);
  });
});
