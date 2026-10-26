import { isObject, MappingTableData } from '@fema-ipaas/core-utils'
import { ReconciliationExpectation, ReconciliationFilter, ReconciliationRule } from './reconciliation'

function compute({ source, target, rule, mappingTables }: ComputeParams): DiffResult {
    const sources = index({ records: source.filter((record) => matches({ record, filters: rule.scope }) && rule.expectations.some((expectation) => matches({ record, filters: expectation.when }))), keyPath: rule.source.keyPath, requireKeys: true })
    const targets = index({ records: target, keyPath: rule.target.keyPath, requireKeys: false })
    const mappings = new Map(mappingTables.map((table) => [table.id, new Map(table.rows.map((row) => [row.k, row.v]))]))
    const differences: ComputedDifference[] = []
    let matched = 0
    for (const [businessKey, records] of sources) {
        const actuals = targets.get(businessKey) ?? []
        if (records.length > 1 || actuals.length > 1) {
            differences.push({ businessKey, aspect: 'duplicate-key', kind: 'MISMATCH', expected: { source: 1, target: 1 }, actual: { source: records.length, target: actuals.length } })
            continue
        }
        const record = records[0]
        const expectations = rule.expectations.filter((expectation) => matches({ record, filters: expectation.when }))
        const failed = expectations.flatMap((expectation): ComputedDifference[] => {
            const judgement = judge({ source: record, target: actuals[0], expectation, mappings })
            return judgement.matches ? [] : [{ businessKey, aspect: expectation.aspect, kind: actuals.length === 0 ? 'MISSING_IN_TARGET' : 'MISMATCH', expected: judgement.expected, actual: judgement.actual }]
        })
        if (expectations.length > 0 && failed.length === 0) {
            matched++
        }
        differences.push(...failed)
    }
    return { matched, differences }
}

function judge({ source, target, expectation, mappings }: JudgeParams): Judgement {
    const condition = expectation.expect
    if (condition.kind === 'EXISTS') {
        return { matches: target !== undefined, expected: true, actual: target !== undefined }
    }
    if (condition.kind === 'FLAG') {
        const actual = read({ record: target, path: condition.targetPath })
        return { matches: actual === condition.value, expected: condition.value, actual: actual ?? null }
    }
    const sourceValue = read({ record: source, path: condition.sourcePath })
    const expected = condition.mappingTableId ? mappings.get(condition.mappingTableId)?.get(String(sourceValue)) : sourceValue
    const actual = read({ record: target, path: condition.targetPath })
    if (expected === undefined) {
        return { matches: false, expected: { missingMapping: condition.mappingTableId ?? null }, actual: actual ?? null }
    }
    const equal = condition.kind === 'CONTAINS'
        ? Array.isArray(actual) && actual.some((value: unknown) => sameValue({ first: expected, second: value }))
        : sameValue({ first: expected, second: actual })
    return { matches: equal, expected, actual: actual ?? null }
}

function sameValue({ first, second }: { first: unknown, second: unknown }): boolean {
    if (first === second) {
        return true
    }
    if (Array.isArray(first) && Array.isArray(second)) {
        return first.length === second.length && first.every((value: unknown, index: number) => sameValue({ first: value, second: second[index] }))
    }
    if (isObject(first) && isObject(second)) {
        const keys = Object.keys(first)
        return keys.length === Object.keys(second).length && keys.every((key) => Object.hasOwn(second, key) && sameValue({ first: first[key], second: second[key] }))
    }
    return false
}

function matches({ record, filters }: { record: Record<string, unknown>, filters: ReconciliationFilter[] }): boolean {
    return filters.every((filter) => filter.in.includes(String(read({ record, path: filter.path }))))
}

function read({ record, path }: { record: unknown, path: string }): unknown {
    return path.split('.').reduce<unknown>((value, key) => isObject(value) ? value[key] : undefined, record)
}

function index({ records, keyPath, requireKeys }: { records: Record<string, unknown>[], keyPath: string, requireKeys: boolean }): Map<string, Record<string, unknown>[]> {
    const result = new Map<string, Record<string, unknown>[]>()
    for (const record of records) {
        const key = read({ record, path: keyPath })
        if (typeof key !== 'string' && typeof key !== 'number' || String(key).trim().length === 0) {
            if (requireKeys) throw new Error('reconciliation.missingBusinessKey')
            continue
        }
        const businessKey = String(key)
        result.set(businessKey, [...result.get(businessKey) ?? [], record])
    }
    return result
}

function appliesTo({ record, rule }: { record: Record<string, unknown>, rule: Pick<ReconciliationRule, 'scope' | 'expectations'> }): boolean {
    return matches({ record, filters: rule.scope }) && rule.expectations.some((expectation) => matches({ record, filters: expectation.when }))
}

export const reconciliationDiff = { compute, appliesTo }

export type ComputedDifference = { businessKey: string, aspect: string, kind: 'MISSING_IN_TARGET' | 'MISMATCH', expected: unknown, actual: unknown }
export type DiffResult = { matched: number, differences: ComputedDifference[] }

type ComputeParams = { source: Record<string, unknown>[], target: Record<string, unknown>[], rule: Pick<ReconciliationRule, 'source' | 'target' | 'scope' | 'expectations'>, mappingTables: MappingTableData[] }
type JudgeParams = { source: Record<string, unknown>, target: Record<string, unknown> | undefined, expectation: ReconciliationExpectation, mappings: Map<string, Map<string, string>> }
type Judgement = { matches: boolean, expected: unknown, actual: unknown }
