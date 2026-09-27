import { describe, expect, it } from 'vitest'
import {
    dataMapping,
    MappingMissingBehavior,
    MappingTableData,
    MappingTransformType,
} from '../src/lib/data-mapping'

const materials: MappingTableData = {
    id: 'mt_materials',
    name: '物料编码对照',
    rows: [{ k: 'M-1024', v: '100231-0001' }, { k: 'M-2048', v: '100231-0002' }],
    missingBehavior: MappingMissingBehavior.ERROR,
    defaultValue: null,
}

describe('dataMapping.evaluate', () => {
    it('applies transform chains in order', () => {
        const result = dataMapping.evaluate({
            spec: {
                fields: [
                    { id: '1', target: 'amount', source: ' 1,280.456 ', transforms: [{ type: MappingTransformType.TRIM }, { type: MappingTransformType.NUMBER }, { type: MappingTransformType.ROUND, arg: '2' }] },
                    { id: '2', target: 'date', source: '2026/09/18', transforms: [{ type: MappingTransformType.DATE, arg: 'YYYY-MM-DD' }] },
                    { id: '3', target: 'source', source: '', constant: undefined, transforms: [{ type: MappingTransformType.DEFAULT, arg: 'Web' }] },
                    { id: '4', target: 'tags', source: 'a， b ,c', transforms: [{ type: MappingTransformType.SPLIT, arg: '，' }] },
                ],
            },
            tables: [],
        })
        expect(result.value).toEqual({ amount: 1280.46, date: '2026-09-18', source: 'Web', tags: ['a', 'b ,c'] })
        expect(result.rows.every((row) => row.error === null)).toBe(true)
    })

    it('maps list items one by one through a lookup table', () => {
        const result = dataMapping.evaluate({
            spec: {
                fields: [{
                    id: 'entries',
                    target: 'FEntity',
                    source: [{ code: 'M-1024', qty: '20' }, { code: 'M-2048', qty: '5' }],
                    transforms: [],
                    each: [
                        { id: 'a', target: 'FMaterialId', itemPath: 'code', transforms: [{ type: MappingTransformType.LOOKUP, arg: 'mt_materials' }] },
                        { id: 'b', target: 'FQty', itemPath: 'qty', transforms: [{ type: MappingTransformType.NUMBER }] },
                    ],
                }],
            },
            tables: [materials],
        })
        expect(result.value).toEqual({ FEntity: [{ FMaterialId: '100231-0001', FQty: 20 }, { FMaterialId: '100231-0002', FQty: 5 }] })
    })

    it('reports missing lookup keys according to the table behavior', () => {
        const spec = { fields: [{ id: '1', target: 'code', source: 'M-9999', transforms: [{ type: MappingTransformType.LOOKUP, arg: 'mt_materials' }] }] }
        expect(dataMapping.evaluate({ spec, tables: [materials] }).rows[0].error).toContain('M-9999')
        expect(dataMapping.evaluate({ spec, tables: [{ ...materials, missingBehavior: MappingMissingBehavior.DEFAULT, defaultValue: 'X' }] }).value).toEqual({ code: 'X' })
        expect(dataMapping.evaluate({ spec, tables: [{ ...materials, missingBehavior: MappingMissingBehavior.PASSTHROUGH }] }).value).toEqual({ code: 'M-9999' })
    })

    it('stops a chain at the first error', () => {
        const result = dataMapping.evaluate({
            spec: { fields: [{ id: '1', target: 'n', source: 'abc', transforms: [{ type: MappingTransformType.NUMBER }, { type: MappingTransformType.ROUND }] }] },
            tables: [],
        })
        expect(result.rows[0].error).toContain('abc')
        expect(result.rows[0].value).toBe('abc')
    })

    it('collects the lookup tables a spec needs', () => {
        expect(dataMapping.lookupTableIds({
            fields: [
                { id: '1', target: 'a', transforms: [{ type: MappingTransformType.LOOKUP, arg: 't1' }] },
                { id: '2', target: 'b', transforms: [], each: [{ id: 'x', target: 'y', transforms: [{ type: MappingTransformType.LOOKUP, arg: 't2' }, { type: MappingTransformType.LOOKUP, arg: 't1' }] }] },
            ],
        })).toEqual(['t1', 't2'])
    })
})
