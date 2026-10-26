import { describe, expect, it } from 'vitest'
import { orgTreePlan, SourceOrgNode, TargetOrgNode } from '../src/lib/org-tree-plan'

function node({ key, parentKey = 'root', name = key, disabled = false }: { key: string, parentKey?: string | null, name?: string, disabled?: boolean }): SourceOrgNode {
    return { key, parentKey, name, order: null, disabled }
}

function plan({ source = [], target = [], bindings = {}, archiveParentId, maxArchives, maxMoves }: { source?: SourceOrgNode[], target?: TargetOrgNode[], bindings?: Record<string, string>, archiveParentId?: string, maxArchives?: number, maxMoves?: number }) {
    return orgTreePlan.build({ source: [node({ key: 'root', parentKey: null }), ...source], target, bindings, rootSourceKey: 'root', rootTargetId: '0', archiveParentId, maxArchives, maxMoves })
}

function department({ id, parentId = '0', name = id, customId = null }: { id: string, parentId?: string, name?: string, customId?: string | null }): TargetOrgNode {
    return { id, parentId, name, customId }
}

describe('organization tree convergence', () => {
    it('creates parents before their children even when the input is unordered', () => {
        const result = plan({ source: [node({ key: 'b', parentKey: 'a' }), node({ key: 'a' })] })
        expect(result.ops.map((op) => op.sourceKey)).toEqual(['a', 'b'])
        expect(result.ops).toEqual([expect.objectContaining({ op: 'CREATE', customId: 'bs-a' }), expect.objectContaining({ op: 'CREATE', parentSourceKey: 'a' })])
    })
    it('keeps bindings authoritative over names and leaves unbound target departments untouched', () => {
        const result = plan({ source: [node({ key: 'a' })], target: [department({ id: 'other', name: 'a' }), department({ id: 'bound', name: 'old' })], bindings: { a: 'bound' } })
        expect(result.ops).toEqual([{ op: 'UPDATE', sourceKey: 'a', targetId: 'bound', name: 'a' }])
    })
    it('binds an existing same-name sibling before creating', () => {
        expect(plan({ source: [node({ key: 'a' })], target: [department({ id: 'existing', name: 'a' })] }).ops).toEqual([{ op: 'BIND', sourceKey: 'a', targetId: 'existing' }])
    })
    it('recovers a custom ID left behind by a failed binding write', () => {
        expect(plan({ source: [node({ key: 'a' })], target: [department({ id: 'existing', name: 'a', customId: 'bs-a' })] }).ops).toEqual([{ op: 'BIND', sourceKey: 'a', targetId: 'existing' }])
    })
    it('recreates stale bindings', () => {
        expect(plan({ source: [node({ key: 'a' })], bindings: { a: 'deleted' } }).ops).toEqual([expect.objectContaining({ op: 'REBIND_CREATE', staleTargetId: 'deleted' })])
    })
    it('updates only fields which changed', () => {
        expect(plan({ source: [node({ key: 'a' })], target: [department({ id: 'target', name: 'a' })], bindings: { a: 'target' } }).ops).toEqual([])
    })
    it('archives disabled departments and reports when no archive is configured', () => {
        const params = { source: [node({ key: 'a', disabled: true })], target: [department({ id: 't' })], bindings: { a: 't' } }
        expect(plan({ ...params, archiveParentId: 'archive' }).ops[0]?.op).toBe('ARCHIVE')
        expect(plan(params).ops[0]?.op).toBe('REPORT_DISABLED')
        expect(plan({ ...params, target: [department({ id: 't', parentId: 'archive' })], archiveParentId: 'archive' }).ops).toEqual([])
    })
    it('reports disconnected parents and cycles without writes', () => {
        expect(plan({ source: [node({ key: 'a', parentKey: 'b' }), node({ key: 'b', parentKey: 'a' }), node({ key: 'c', parentKey: 'missing' })] }).ops).toEqual(['a', 'b', 'c'].map((sourceKey) => ({ op: 'ORPHAN', sourceKey })))
    })
    it('gates archives and moves as a whole plan', () => {
        expect(plan({ source: [node({ key: 'a', disabled: true })], target: [department({ id: 't' })], bindings: { a: 't' }, archiveParentId: 'archive', maxArchives: 0 }).gateExceeded).toEqual({ archives: 1, moves: 0 })
        expect(plan({ source: [node({ key: 'a' })], target: [department({ id: 't', parentId: 'wrong', name: 'a' })], bindings: { a: 't' }, maxMoves: 0 }).gateExceeded).toEqual({ archives: 0, moves: 1 })
    })
    it('orders parent/child swaps without transient cycles', () => {
        expect(plan({ source: [node({ key: 'a' }), node({ key: 'b', parentKey: 'a' })], target: [department({ id: 'ta', name: 'a', parentId: 'tb' }), department({ id: 'tb', name: 'b' })], bindings: { a: 'ta', b: 'tb' } }).ops).toEqual([{ op: 'UPDATE', sourceKey: 'a', targetId: 'ta', parentSourceKey: 'root' }, { op: 'UPDATE', sourceKey: 'b', targetId: 'tb', parentSourceKey: 'a' }])
    })
    it('refuses ambiguous target siblings', () => {
        expect(() => plan({ source: [node({ key: 'a' })], target: [department({ id: 'x', name: 'a' }), department({ id: 'y', name: 'a' })] })).toThrow('Several departments')
    })
    it('treats the chosen root as an anchor when it is renamed', () => {
        expect(orgTreePlan.build({ source: [node({ key: 'root', parentKey: null, name: 'new' })], target: [], bindings: {}, rootSourceKey: 'root', rootTargetId: '0' }).ops).toEqual([])
    })
})
