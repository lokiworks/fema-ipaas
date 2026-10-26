import { describe, expect, it } from 'vitest'
import { MappingTableData, MappingMissingBehavior } from '@fema-ipaas/core-utils'
import { reconciliationDiff, ReconciliationExpectation } from '../../src'

function compare({ source = [{ id: '1', department: 'hr', active: true }], target = [{ id: '1', departments: ['od-hr'], suspended: false }], expectations, mappingTables = [] }: { source?: Record<string, unknown>[], target?: Record<string, unknown>[], expectations: ReconciliationExpectation[], mappingTables?: MappingTableData[] }) {
    const endpoint = { connectorName: 'test', actionName: 'enumerate', connectionExternalId: 'c', input: {}, keyPath: 'id' }
    return reconciliationDiff.compute({ source, target, rule: { source: endpoint, target: endpoint, scope: [], expectations }, mappingTables })
}

describe('full-list reconciliation', () => {
    it('checks existence and ignores target-only accounts', () => {
        expect(compare({ target: [{ id: '1' }, { id: 'unmanaged' }, { name: 'no-business-key' }], expectations: [{ aspect: 'exists', when: [], expect: { kind: 'EXISTS' } }] })).toEqual({ matched: 1, differences: [] })
        expect(compare({ target: [], expectations: [{ aspect: 'exists', when: [], expect: { kind: 'EXISTS' } }] }).differences[0]).toMatchObject({ businessKey: '1', kind: 'MISSING_IN_TARGET' })
    })
    it('compares equal fields independently of object property order', () => {
        expect(compare({ source: [{ id: '1', value: { x: 1, y: 2 } }], target: [{ id: '1', value: { y: 2, x: 1 } }], expectations: [{ aspect: 'value', when: [], expect: { kind: 'EQUALS', sourcePath: 'value', targetPath: 'value' } }] }).matched).toBe(1)
    })
    it('resolves mappings before testing containment', () => {
        const table: MappingTableData = { id: 'departments', name: 'Departments', rows: [{ k: 'hr', v: 'od-hr' }], missingBehavior: MappingMissingBehavior.ERROR, defaultValue: null }
        expect(compare({ expectations: [{ aspect: 'department', when: [], expect: { kind: 'CONTAINS', sourcePath: 'department', targetPath: 'departments', mappingTableId: table.id } }], mappingTables: [table] }).matched).toBe(1)
    })
    it('reports a missing mapping rather than matching two absent fields', () => {
        expect(compare({ expectations: [{ aspect: 'department', when: [], expect: { kind: 'CONTAINS', sourcePath: 'department', targetPath: 'departments', mappingTableId: 'missing' } }] }).differences[0]?.expected).toEqual({ missingMapping: 'missing' })
    })
    it('compares flags as booleans and applies per-aspect conditions', () => {
        expect(compare({ expectations: [{ aspect: 'suspended', when: [], expect: { kind: 'FLAG', targetPath: 'suspended', value: false } }] }).matched).toBe(1)
        expect(compare({ expectations: [{ aspect: 'suspended', when: [{ path: 'active', in: ['false'] }], expect: { kind: 'FLAG', targetPath: 'suspended', value: true } }] }).differences).toEqual([])
    })
    it('reports duplicate source or target business keys without proposing arbitrary repairs', () => {
        expect(compare({ source: [{ id: '1' }, { id: '1' }], expectations: [{ aspect: 'exists', when: [], expect: { kind: 'EXISTS' } }] }).differences[0]?.aspect).toBe('duplicate-key')
        expect(compare({ target: [{ id: '1' }, { id: '1' }], expectations: [{ aspect: 'exists', when: [], expect: { kind: 'EXISTS' } }] }).differences[0]?.aspect).toBe('duplicate-key')
    })
    it('rejects a source record with no business key', () => {
        expect(() => compare({ source: [{}], expectations: [{ aspect: 'exists', when: [], expect: { kind: 'EXISTS' } }] })).toThrow('reconciliation.missingBusinessKey')
    })
})
