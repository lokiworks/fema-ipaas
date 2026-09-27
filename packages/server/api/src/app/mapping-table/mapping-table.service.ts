import { ApplicationError, ErrorCode, generateId, isNil, MappingTableData, ProjectId, UserId } from '@fema-ipaas/core-utils'
import {
    MappingTable,
    MappingTableReference,
    MappingTableSummary,
    UpsertMappingTableRequestBody,
    workflowStructureUtil,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowVersionRepo, workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { MappingTableEntity, MappingTableSchema } from './mapping-table.entity'

export const mappingTableRepo = repoFactory(MappingTableEntity)

export const mappingTableService = (log: FastifyBaseLogger) => ({
    async list({ projectId }: { projectId: ProjectId }): Promise<MappingTableSummary[]> {
        const tables = await mappingTableRepo().find({ where: { projectId }, order: { name: 'ASC' } })
        return tables.map(toSummary)
    },

    async getOneOrThrow({ id, projectId }: TableRef): Promise<MappingTable> {
        const table = await mappingTableRepo().findOneBy({ id, projectId })
        if (isNil(table)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityId: id, entityType: 'MappingTable' } })
        }
        return withoutRelations(table)
    },

    async create({ request, actorId }: { request: UpsertMappingTableRequestBody, actorId: UserId }): Promise<MappingTable> {
        await assertNameAvailable({ projectId: request.projectId, name: request.name, excludeId: null })
        const id = generateId()
        await mappingTableRepo().insert({ id, ...fieldsOf(request), projectId: request.projectId, updatedById: actorId })
        log.info({ project: { id: request.projectId }, mappingTable: { id } }, '[mappingTableService#create] Mapping table created')
        return this.getOneOrThrow({ id, projectId: request.projectId })
    },

    async update({ id, request, actorId }: { id: string, request: UpsertMappingTableRequestBody, actorId: UserId }): Promise<MappingTable> {
        await this.getOneOrThrow({ id, projectId: request.projectId })
        await assertNameAvailable({ projectId: request.projectId, name: request.name, excludeId: id })
        await mappingTableRepo().update({ id, projectId: request.projectId }, { ...fieldsOf(request), updatedById: actorId })
        return this.getOneOrThrow({ id, projectId: request.projectId })
    },

    async delete({ id, projectId }: TableRef): Promise<void> {
        await this.getOneOrThrow({ id, projectId })
        const references = await this.references({ id, projectId })
        if (references.length > 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: `Mapping table is used by ${references.length} steps` },
            })
        }
        await mappingTableRepo().delete({ id, projectId })
    },

    async references({ id, projectId }: TableRef): Promise<MappingTableReference[]> {
        const workflows = await workflowRepo().find({ where: { projectId }, select: ['id', 'publishedVersionId'] })
        if (workflows.length === 0) {
            return []
        }
        const latest = await workflowVersionService(log).getLatestVersionsByWorkflowIds(workflows.map((workflow) => workflow.id), projectId)
        const publishedIds = workflows.map((workflow) => workflow.publishedVersionId).filter((versionId): versionId is string => !isNil(versionId))
        const published = publishedIds.length === 0 ? [] : await workflowVersionRepo().find({ where: { id: In(publishedIds) } })
        const versions: VersionWithFlag[] = [
            ...[...latest.values()].map((version) => ({ version, published: publishedIds.includes(version.id) })),
            ...published.filter((version) => !isNil(latest.get(version.workflowId)) && latest.get(version.workflowId)?.id !== version.id).map((version) => ({ version, published: true })),
        ]
        return versions.flatMap(({ version, published: isPublished }) => referencesIn({ version, tableId: id, published: isPublished }))
    },

    async getForWorker({ id, projectId }: TableRef): Promise<MappingTableData> {
        const table = await this.getOneOrThrow({ id, projectId })
        return {
            id: table.id,
            name: table.name,
            rows: table.rows,
            missingBehavior: table.missingBehavior,
            defaultValue: table.defaultValue ?? null,
        }
    },
})

function referencesIn({ version, tableId, published }: { version: WorkflowVersion, tableId: string, published: boolean }): MappingTableReference[] {
    return workflowStructureUtil.getAllSteps(version.trigger)
        .filter((step) => JSON.stringify(step.settings).includes(tableId))
        .map((step) => ({
            workflowId: version.workflowId,
            workflowDisplayName: version.displayName,
            stepName: step.name,
            stepDisplayName: step.displayName,
            published,
        }))
}

async function assertNameAvailable({ projectId, name, excludeId }: { projectId: ProjectId, name: string, excludeId: string | null }): Promise<void> {
    const existing = await mappingTableRepo().findOneBy({ projectId, name })
    if (!isNil(existing) && existing.id !== excludeId) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'Mapping table name already used' } })
    }
}

function fieldsOf(request: UpsertMappingTableRequestBody): Omit<MappingTable, 'id' | 'created' | 'updated' | 'projectId' | 'updatedById'> {
    return {
        name: request.name,
        description: request.description,
        keyLabel: request.keyLabel,
        valueLabel: request.valueLabel,
        missingBehavior: request.missingBehavior,
        defaultValue: request.defaultValue,
        rows: request.rows.map((row) => ({ k: row.k.trim(), v: row.v })),
    }
}

function toSummary(table: MappingTableSchema): MappingTableSummary {
    const { rows, ...rest } = withoutRelations(table)
    return { ...rest, rowCount: rows.length }
}

function withoutRelations(table: MappingTableSchema): MappingTable {
    return {
        id: table.id,
        created: table.created,
        updated: table.updated,
        projectId: table.projectId,
        name: table.name,
        description: table.description,
        keyLabel: table.keyLabel,
        valueLabel: table.valueLabel,
        missingBehavior: table.missingBehavior,
        defaultValue: table.defaultValue,
        rows: table.rows,
        updatedById: table.updatedById,
    }
}

type TableRef = {
    id: string
    projectId: ProjectId
}

type VersionWithFlag = {
    version: WorkflowVersion
    published: boolean
}
