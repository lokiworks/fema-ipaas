import { describe, expect, it } from 'vitest'
import { dataMapping, MappingMissingBehavior, MappingTableData, MappingTransformType } from '../src/lib/data-mapping'
import { mappingCoverage } from '../src/lib/mapping-coverage'

const departments: MappingTableData = {
    id: 'mt_dept',
    name: '部门对照',
    rows: [{ k: '20301', v: 'od-rd' }, { k: '20302', v: 'od-hr' }],
    missingBehavior: MappingMissingBehavior.ERROR,
    defaultValue: null,
}

describe('dataMapping.lookupKeys', () => {
    it('returns the key as it reaches the lookup, after the transforms before it', () => {
        const keys = dataMapping.lookupKeys({
            row: {
                id: 'r1',
                target: 'departmentId',
                source: ' 20301 ',
                transforms: [{ type: MappingTransformType.TRIM }, { type: MappingTransformType.STRING }, { type: MappingTransformType.LOOKUP, arg: 'mt_dept' }],
            },
            tables: [departments],
        })
        expect(keys).toEqual([{ rowId: 'r1', target: 'departmentId', tableId: 'mt_dept', key: '20301' }])
    })

    it('skips blank sources and rows without a lookup', () => {
        const blank = dataMapping.lookupKeys({
            row: { id: 'r1', target: 'a', source: '', transforms: [{ type: MappingTransformType.LOOKUP, arg: 'mt_dept' }] },
            tables: [departments],
        })
        const plain = dataMapping.lookupKeys({ row: { id: 'r2', target: 'b', source: 'x', transforms: [] }, tables: [departments] })
        expect(blank).toEqual([])
        expect(plain).toEqual([])
    })

    it('collects one key per list item for each-item lookups', () => {
        const keys = dataMapping.lookupKeys({
            row: {
                id: 'r1',
                target: 'positions',
                source: [{ deptCode: 20301 }, { deptCode: 20399 }],
                transforms: [],
                each: [{ id: 'i1', target: 'dept', itemPath: 'deptCode', transforms: [{ type: MappingTransformType.LOOKUP, arg: 'mt_dept' }] }],
            },
            tables: [departments],
        })
        expect(keys.map((found) => found.key)).toEqual(['20301', '20399'])
    })
})

describe('mappingCoverage.tally', () => {
    it('counts hits by occurrence and lists uncovered keys by frequency', () => {
        const [coverage] = mappingCoverage.tally({
            observations: [
                { tableId: 'mt_dept', key: '20301', observedAt: '2026-10-01T00:00:00.000Z' },
                { tableId: 'mt_dept', key: '20399', observedAt: '2026-10-02T00:00:00.000Z' },
                { tableId: 'mt_dept', key: '20399', observedAt: '2026-10-03T00:00:00.000Z' },
                { tableId: 'mt_dept', key: '20400' },
            ],
            tables: [departments],
        })
        expect(coverage.total).toBe(4)
        expect(coverage.hit).toBe(1)
        expect(coverage.uncovered).toEqual([
            { key: '20399', count: 2, lastSeenAt: '2026-10-03T00:00:00.000Z' },
            { key: '20400', count: 1, lastSeenAt: undefined },
        ])
        expect(mappingCoverage.hitRate({ total: coverage.total, hit: coverage.hit })).toBe(0.25)
    })

    it('never counts or lists keys that were masked in the log', () => {
        const [coverage] = mappingCoverage.tally({
            observations: [
                { tableId: 'mt_dept', key: '******' },
                { tableId: 'mt_dept', key: '129****1283' },
                { tableId: 'mt_dept', key: 'z***@example.com' },
                { tableId: 'mt_dept', key: '20301' },
            ],
            tables: [departments],
        })
        expect(coverage.total).toBe(1)
        expect(coverage.maskedSkipped).toBe(3)
        expect(coverage.uncovered).toEqual([])
    })

    it('has no rate when nothing was observed', () => {
        expect(mappingCoverage.hitRate({ total: 0, hit: 0 })).toBeNull()
    })
})
