import { isNil, MappingTransformType, ProjectId, UserId } from '@fema-ipaas/core-utils'
import { WorkflowExportMappingTable, workflowStructureUtil, WorkflowTrigger } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { mappingTableRepo, mappingTableService } from '../mapping-table/mapping-table.service'
import { workflowTransferUtils } from './workflow-transfer-utils'

export const workflowTransferTables = {
    referencedTableIds,
    withoutLookupTables,
    async exportTables({ log, projectId, ids }: ExportParams): Promise<WorkflowExportMappingTable[]> {
        const tables = await Promise.all(ids.map((id) => mappingTableService(log).getOneOrThrow({ id, projectId }).catch(() => null)))
        return tables
            .filter((table): table is NonNullable<typeof table> => !isNil(table))
            .map((table) => ({
                id: table.id,
                name: table.name,
                description: table.description,
                keyLabel: table.keyLabel,
                valueLabel: table.valueLabel,
                missingBehavior: table.missingBehavior,
                defaultValue: table.defaultValue ?? null,
                rows: table.rows,
            }))
    },
    async resolveInProject({ log, projectId, userId, tables }: ResolveParams): Promise<Map<string, string>> {
        const existing = await mappingTableRepo().find({ where: { projectId } })
        const resolved = await tables.reduce<Promise<Resolved>>(async (accPromise, table) => {
            const acc = await accPromise
            const reusable = existing.find((candidate) => candidate.name === table.name && candidate.keyLabel === table.keyLabel && candidate.valueLabel === table.valueLabel)
            if (!isNil(reusable)) {
                return { ...acc, idMap: new Map([...acc.idMap, [table.id, reusable.id]]) }
            }
            const name = uniqueName({ base: table.name, taken: [...existing.map((candidate) => candidate.name), ...acc.createdNames] })
            const created = await mappingTableService(log).create({
                actorId: userId,
                request: {
                    projectId,
                    name,
                    description: table.description.slice(0, MAX_DESCRIPTION),
                    keyLabel: table.keyLabel,
                    valueLabel: table.valueLabel,
                    missingBehavior: table.missingBehavior,
                    defaultValue: table.defaultValue,
                    rows: table.rows,
                },
            })
            return { idMap: new Map([...acc.idMap, [table.id, created.id]]), createdNames: [...acc.createdNames, created.name] }
        }, Promise.resolve({ idMap: new Map<string, string>(), createdNames: [] }))
        return resolved.idMap
    },
}

function referencedTableIds(trigger: WorkflowTrigger): string[] {
    const ids = workflowStructureUtil.getAllSteps(trigger).flatMap((step) => lookupTableIdsIn(step.settings?.input))
    return [...new Set(ids)]
}

function withoutLookupTables(trigger: WorkflowTrigger): WorkflowTrigger {
    const stripped = workflowStructureUtil.transferStep(JSON.parse(JSON.stringify(trigger)), (step) => {
        const input = step.settings?.input
        if (isNil(input)) {
            return step
        }
        return { ...step, settings: { ...step.settings, input: stripLookupArgs(input) } }
    })
    return workflowTransferUtils.asTrigger({ original: trigger, candidate: stripped })
}

function stripLookupArgs(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => stripLookupArgs(item))
    }
    if (typeof value !== 'object' || value === null) {
        return value
    }
    if (isLookupTransform(value)) {
        return { type: value.type }
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripLookupArgs(item)]))
}

function lookupTableIdsIn(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.flatMap((item) => lookupTableIdsIn(item))
    }
    if (typeof value !== 'object' || value === null) {
        return []
    }
    const own = isLookupTransform(value) ? [value.arg] : []
    return [...own, ...Object.values(value).flatMap((item) => lookupTableIdsIn(item))]
}

function isLookupTransform(value: object): value is { type: string, arg: string } {
    return 'type' in value && value.type === MappingTransformType.LOOKUP && 'arg' in value && typeof value.arg === 'string' && value.arg.length > 0
}

function uniqueName({ base, taken }: { base: string, taken: string[] }): string {
    const trimmed = base.slice(0, MAX_NAME)
    if (!taken.includes(trimmed)) {
        return trimmed
    }
    return Array.from({ length: MAX_NAME_ATTEMPTS }, (_, index) => `${trimmed.slice(0, MAX_NAME - 4)} (${index + 2})`).find((candidate) => !taken.includes(candidate)) ?? trimmed
}

const MAX_NAME = 30
const MAX_DESCRIPTION = 100
const MAX_NAME_ATTEMPTS = 20

type ExportParams = {
    log: FastifyBaseLogger
    projectId: ProjectId
    ids: string[]
}

type ResolveParams = {
    log: FastifyBaseLogger
    projectId: ProjectId
    userId: UserId
    tables: WorkflowExportMappingTable[]
}

type Resolved = {
    idMap: Map<string, string>
    createdNames: string[]
}
