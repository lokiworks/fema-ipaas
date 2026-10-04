import { CoverageObservation, dataMapping, isNil, mappingCoverage, MappingCoverageSource, MappingSpec, MappingTableData, ProjectId, TableCoverage } from '@fema-ipaas/core-utils'
import { workflowStructureUtil } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { IsNull } from 'typeorm'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { mappingTableService } from './mapping-table.service'

export const mappingTableCoverageService = (log: FastifyBaseLogger) => ({
    async forWorkflow({ workflowId, projectId }: { workflowId: string, projectId: ProjectId }): Promise<MappingCoverageSource[]> {
        const workflow = await workflowRepo().findOneBy({ id: workflowId, projectId })
        if (isNil(workflow)) {
            return []
        }
        return collectSources({ log, projectId, workflowIds: [workflowId], tableId: null })
    },

    async forTable({ tableId, projectId }: { tableId: string, projectId: ProjectId }): Promise<MappingCoverageSource[]> {
        await mappingTableService(log).getOneOrThrow({ id: tableId, projectId })
        const references = await mappingTableService(log).references({ id: tableId, projectId })
        const workflowIds = [...new Set(references.map((reference) => reference.workflowId))]
        return collectSources({ log, projectId, workflowIds, tableId })
    },
})

async function collectSources({ log, projectId, workflowIds, tableId }: { log: FastifyBaseLogger, projectId: ProjectId, workflowIds: string[], tableId: string | null }): Promise<MappingCoverageSource[]> {
    const latest = await workflowVersionService(log).getLatestVersionsByWorkflowIds(workflowIds, projectId)
    const perWorkflow = await Promise.all(workflowIds.map(async (workflowId) => {
        const version = latest.get(workflowId)
        const runs = await scanRuns({ log, projectId, workflowId, tableId })
        return runs.sources.map((source): MappingCoverageSource => ({
            workflowId,
            workflowDisplayName: version?.displayName ?? workflowId,
            stepName: source.stepName,
            stepDisplayName: isNil(version) ? source.stepName : workflowStructureUtil.getStep(source.stepName, version.trigger)?.displayName ?? source.stepName,
            tableId: source.tableId,
            tableName: source.tableName,
            runsScanned: runs.runsScanned,
            runsWithoutPayload: runs.runsWithoutPayload,
            total: source.coverage.total,
            hit: source.coverage.hit,
            maskedSkipped: source.coverage.maskedSkipped,
            uncovered: source.coverage.uncovered,
        }))
    }))
    return perWorkflow.flat()
}

async function scanRuns({ log, projectId, workflowId, tableId }: { log: FastifyBaseLogger, projectId: ProjectId, workflowId: string, tableId: string | null }): Promise<RunScan> {
    const executions = await executionRepo().find({
        where: { projectId, workflowId, archivedAt: IsNull() },
        order: { created: 'DESC' },
        take: RECENT_RUNS,
        select: ['id', 'created', 'projectId', 'logsFileId', 'displayLogsFileId'],
    })
    const logged = await Promise.all(executions.map(async (execution) => ({
        execution,
        steps: await executionService(log).getDisplayStepsOrNull({ execution }),
    })))
    const withPayload = logged.flatMap(({ execution, steps }) => (isNil(steps) || !hasLoggedInput({ steps }) ? [] : [{ execution, steps }]))
    const specs = withPayload.flatMap(({ execution, steps }) => mapperInputs({ steps }).map((found) => ({ ...found, observedAt: execution.created })))
    const tableIds = [...new Set(specs.flatMap(({ spec }) => dataMapping.lookupTableIds(spec)))].filter((id) => tableId === null || id === tableId)
    const tables = await Promise.all(tableIds.map((id) => mappingTableService(log).getForWorker({ id, projectId }).catch(() => null)))
    const known = tables.filter((table): table is MappingTableData => table !== null)
    const observations = specs.flatMap(({ stepName, spec, observedAt }) => spec.fields
        .flatMap((row) => dataMapping.lookupKeys({ row, tables: known }))
        .filter((found) => known.some((table) => table.id === found.tableId))
        .map((found): StepObservation => ({ stepName, tableId: found.tableId, key: found.key, observedAt })))
    const stepNames = [...new Set(observations.map((observation) => observation.stepName))]
    const sources = stepNames.flatMap((stepName) => {
        const own: CoverageObservation[] = observations.filter((observation) => observation.stepName === stepName)
        return mappingCoverage.tally({ observations: own, tables: known }).map((coverage) => ({
            stepName,
            tableId: coverage.tableId,
            tableName: known.find((table) => table.id === coverage.tableId)?.name ?? '',
            coverage,
        }))
    })
    return {
        runsScanned: executions.length,
        runsWithoutPayload: executions.length - withPayload.length,
        sources,
    }
}

function hasLoggedInput({ steps }: { steps: Record<string, unknown> }): boolean {
    return Object.values(steps).some((step) => isRecord(step) && !isNil(step['input']))
}

function mapperInputs({ steps }: { steps: Record<string, unknown> }): { stepName: string, spec: MappingSpec }[] {
    return Object.entries(steps).flatMap(([stepName, step]) => {
        const own = specOf({ step }).map((spec) => ({ stepName, spec }))
        return [...own, ...iterationSteps({ step }).flatMap((inner) => mapperInputs({ steps: inner }))]
    })
}

function specOf({ step }: { step: unknown }): MappingSpec[] {
    const input = isRecord(step) ? step['input'] : undefined
    const mapping = isRecord(input) ? input['mapping'] : undefined
    const parsed = MappingSpec.safeParse(mapping)
    return parsed.success ? [parsed.data] : []
}

function iterationSteps({ step }: { step: unknown }): Record<string, unknown>[] {
    const output = isRecord(step) ? step['output'] : undefined
    const iterations = isRecord(output) ? output['iterations'] : undefined
    return Array.isArray(iterations) ? iterations.filter(isRecord) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const RECENT_RUNS = 30

type RunScan = {
    runsScanned: number
    runsWithoutPayload: number
    sources: { stepName: string, tableId: string, tableName: string, coverage: TableCoverage }[]
}

type StepObservation = CoverageObservation & {
    stepName: string
}
