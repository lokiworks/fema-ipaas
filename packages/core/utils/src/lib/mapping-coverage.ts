import { MappingTableData } from './data-mapping'
import { MASKED_PLACEHOLDER } from './privacy-masking'

export const mappingCoverage = {
    tally,
    isMaskedKey,
    hitRate,
}

function tally({ observations, tables }: { observations: CoverageObservation[], tables: MappingTableData[] }): TableCoverage[] {
    const tableIds = [...new Set(observations.map((observation) => observation.tableId))]
    return tableIds.map((tableId) => tallyTable({ tableId, observations: observations.filter((observation) => observation.tableId === tableId), table: tables.find((candidate) => candidate.id === tableId) }))
}

function tallyTable({ tableId, observations, table }: { tableId: string, observations: CoverageObservation[], table: MappingTableData | undefined }): TableCoverage {
    const known = new Set((table?.rows ?? []).map((row) => row.k))
    const visible = observations.filter((observation) => !isMaskedKey(observation.key))
    const hit = visible.filter((observation) => known.has(observation.key)).length
    const missing = visible.filter((observation) => !known.has(observation.key))
    const uncovered = [...new Set(missing.map((observation) => observation.key))].map((key): UncoveredKey => {
        const seen = missing.filter((observation) => observation.key === key)
        return {
            key,
            count: seen.length,
            lastSeenAt: seen.map((observation) => observation.observedAt).filter((at): at is string => at !== undefined).sort().pop(),
        }
    }).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    return {
        tableId,
        total: visible.length,
        hit,
        maskedSkipped: observations.length - visible.length,
        uncovered,
    }
}

function isMaskedKey(key: string): boolean {
    return key.includes(MASKED_PLACEHOLDER) || MASK_RUN.test(key)
}

function hitRate({ total, hit }: { total: number, hit: number }): number | null {
    return total === 0 ? null : hit / total
}

const MASK_RUN = /\*{3,}/

export type CoverageObservation = {
    tableId: string
    key: string
    observedAt?: string
}

export type UncoveredKey = {
    key: string
    count: number
    lastSeenAt?: string
}

export type TableCoverage = {
    tableId: string
    total: number
    hit: number
    maskedSkipped: number
    uncovered: UncoveredKey[]
}

export type MappingCoverageSource = {
    workflowId: string
    workflowDisplayName: string
    stepName: string
    stepDisplayName: string
    tableId: string
    tableName: string
    runsScanned: number
    runsWithoutPayload: number
    total: number
    hit: number
    maskedSkipped: number
    uncovered: UncoveredKey[]
}
