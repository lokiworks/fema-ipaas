import {
  MappingMissingBehavior,
  MappingTableData,
  MappingTransformType,
} from '@fema-ipaas/core-utils';

import {
  CoverageOrigin,
  mappingCoverageUtils,
} from '@/features/mapping-tables/utils/mapping-coverage-utils';

const departments: MappingTableData = {
  id: 'mt_dept',
  name: 'Departments',
  rows: [{ k: '20301', v: 'od-rd' }],
  missingBehavior: MappingMissingBehavior.ERROR,
  defaultValue: null,
};

const spec = {
  fields: [
    {
      id: 'dept',
      target: 'departmentId',
      source: "{{trigger['output']['body']['dept']}}",
      transforms: [
        { type: MappingTransformType.STRING },
        { type: MappingTransformType.LOOKUP, arg: 'mt_dept' },
      ],
    },
  ],
};

describe('mappingCoverageUtils.sampleCoverage', () => {
  it('resolves the source against the sample and counts the lookup', () => {
    const [covered] = mappingCoverageUtils.sampleCoverage({
      spec,
      sampleData: { trigger: { body: { dept: 20301 } } },
      tables: [departments],
    });
    expect(covered.total).toBe(1);
    expect(covered.hit).toBe(1);
    expect(covered.uncovered).toEqual([]);
  });

  it('lists a sample value the table has no row for', () => {
    const [missing] = mappingCoverageUtils.sampleCoverage({
      spec,
      sampleData: { trigger: { body: { dept: 20399 } } },
      tables: [departments],
    });
    expect(missing.uncovered.map((found) => found.key)).toEqual(['20399']);
    expect(mappingCoverageUtils.percent(missing)).toBe(0);
  });

  it('has nothing to measure without a sample', () => {
    expect(
      mappingCoverageUtils.sampleCoverage({
        spec,
        sampleData: {},
        tables: [departments],
      }),
    ).toEqual([]);
  });

  it('never lists a value that looks masked', () => {
    const [masked] = mappingCoverageUtils.sampleCoverage({
      spec,
      sampleData: { trigger: { body: { dept: '129****1283' } } },
      tables: [departments],
    });
    expect(masked.uncovered).toEqual([]);
    expect(masked.maskedSkipped).toBe(1);
  });
});

describe('mappingCoverageUtils entries', () => {
  it('joins run and sample keys per table without repeating a key', () => {
    const entries = [
      ...mappingCoverageUtils.fromRuns([
        {
          workflowId: 'wf',
          workflowDisplayName: 'Flow',
          stepName: 'step_1',
          stepDisplayName: 'Map',
          tableId: 'mt_dept',
          tableName: 'Departments',
          runsScanned: 5,
          runsWithoutPayload: 0,
          total: 4,
          hit: 3,
          maskedSkipped: 0,
          uncovered: [{ key: '20399', count: 1 }],
        },
      ]),
      ...mappingCoverageUtils.fromSample({
        coverage: [
          {
            tableId: 'mt_dept',
            total: 1,
            hit: 0,
            maskedSkipped: 0,
            uncovered: [
              { key: '20399', count: 1 },
              { key: '20400', count: 1 },
            ],
          },
        ],
        tables: [departments],
      }),
    ];
    expect(entries.map((entry) => entry.origin)).toEqual([
      CoverageOrigin.RUNS,
      CoverageOrigin.SAMPLE,
    ]);
    expect(
      mappingCoverageUtils.uncoveredKeys({ entries, tableId: 'mt_dept' }),
    ).toEqual(['20399', '20400']);
    expect(mappingCoverageUtils.percent(entries[0])).toBe(75);
  });
});
