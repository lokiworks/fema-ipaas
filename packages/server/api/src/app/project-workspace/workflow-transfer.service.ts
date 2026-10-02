import { ApplicationError, ErrorCode, isNil, ProjectId, TenantId, UserId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    ConnectionScope,
    Note,
    WORKFLOW_EXPORT_FORMAT,
    WORKFLOW_EXPORT_VERSION,
    WORKFLOW_NAME_MAX_LENGTH,
    WorkflowExportFile,
    WorkflowOperationType,
    WorkflowTransferResult,
    WorkflowTrigger,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { folderRepo } from '../workflows/folder/folder.service'
import { workflowNaming } from '../workflows/workflow/workflow-naming'
import { workflowService } from '../workflows/workflow/workflow.service'
import { migrateWorkflowVersionTemplate } from '../workflows/workflow-version/migrations'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { workflowTransferTables } from './workflow-transfer-tables'
import { workflowTransferUtils } from './workflow-transfer-utils'

export const workflowTransferService = (log: FastifyBaseLogger) => ({
    async exportFile({ projectId, workflowId }: { projectId: ProjectId, workflowId: string }): Promise<WorkflowExportFile> {
        const workflow = await workflowService(log).getOnePopulatedOrThrow({ id: workflowId, projectId })
        const version = await workflowVersionService(log).getWorkflowVersionOrThrow({
            workflowId,
            versionId: workflow.version.id,
            removeConnectionsName: true,
            removeSampleData: true,
            projectId,
        })
        const { trigger } = workflowTransferUtils.stripUnavailableConnections({ trigger: version.trigger, isAvailable: () => false })
        const mappingTables = await workflowTransferTables.exportTables({ log, projectId, ids: workflowTransferTables.referencedTableIds(trigger) })
        return {
            format: WORKFLOW_EXPORT_FORMAT,
            version: WORKFLOW_EXPORT_VERSION,
            exportedAt: dayjsUtil().toISOString(),
            workflow: {
                name: version.displayName,
                description: descriptionOf(workflow.metadata) ?? undefined,
                trigger,
                schemaVersion: version.schemaVersion ?? null,
                notes: version.notes,
            },
            ...(mappingTables.length > 0 ? { mappingTables } : {}),
        }
    },

    async importFile({ projectId, folderId, file, userId, tenantId }: ImportParams): Promise<WorkflowTransferResult> {
        const stripped = workflowTransferUtils.stripUnavailableConnections({
            trigger: workflowTransferUtils.clearSampleData(file.workflow.trigger),
            isAvailable: () => false,
        })
        const idMap = await workflowTransferTables.resolveInProject({ log, projectId, userId, tables: file.mappingTables ?? [] })
        const trigger = workflowTransferUtils.remapIds({ trigger: stripped.trigger, idMap })
        const { cleared } = stripped
        return createFromGraph({
            log,
            projectId,
            folderId,
            userId,
            tenantId,
            displayName: file.workflow.name,
            description: file.workflow.description,
            trigger,
            schemaVersion: file.workflow.schemaVersion ?? null,
            notes: file.workflow.notes ?? [],
            cleared,
        })
    },

    async createFromTrigger({ projectId, userId, tenantId, displayName, description, trigger, schemaVersion, notes }: CreateFromTriggerParams): Promise<WorkflowTransferResult> {
        return createFromGraph({
            log,
            projectId,
            userId,
            tenantId,
            displayName,
            description,
            trigger,
            schemaVersion: schemaVersion ?? null,
            notes: notes ?? [],
            cleared: 0,
        })
    },

    async replaceDraft({ projectId, workflowId, userId, tenantId, displayName, trigger, schemaVersion, notes }: ReplaceDraftParams): Promise<void> {
        const migrated = await migrateWorkflowVersionTemplate({
            displayName,
            trigger,
            schemaVersion: schemaVersion ?? undefined,
            notes: notes ?? [],
            valid: false,
        })
        await workflowService(log).update({
            id: workflowId,
            projectId,
            tenantId,
            userId,
            operation: {
                type: WorkflowOperationType.IMPORT_WORKFLOW,
                request: {
                    displayName,
                    trigger: migrated.trigger,
                    schemaVersion: migrated.schemaVersion,
                    notes: migrated.notes,
                },
            },
        })
    },

    async copy({ sourceProjectId, workflowId, targetProjectId, folderId, userId, tenantId }: CopyParams): Promise<WorkflowTransferResult> {
        const workflow = await workflowService(log).getOnePopulatedOrThrow({ id: workflowId, projectId: sourceProjectId })
        const version = await workflowVersionService(log).getWorkflowVersionOrThrow({
            workflowId,
            versionId: workflow.version.id,
            removeSampleData: true,
            projectId: sourceProjectId,
        })
        const isAvailable = sourceProjectId === targetProjectId
            ? () => true
            : await connectionAvailability({ tenantId, projectId: targetProjectId, trigger: version.trigger })
        const stripped = workflowTransferUtils.stripUnavailableConnections({ trigger: version.trigger, isAvailable })
        const idMap = sourceProjectId === targetProjectId
            ? new Map<string, string>()
            : await workflowTransferTables.resolveInProject({
                log,
                projectId: targetProjectId,
                userId,
                tables: await workflowTransferTables.exportTables({ log, projectId: sourceProjectId, ids: workflowTransferTables.referencedTableIds(stripped.trigger) }),
            })
        const trigger = workflowTransferUtils.remapIds({ trigger: stripped.trigger, idMap })
        const { cleared } = stripped
        return createFromGraph({
            log,
            projectId: targetProjectId,
            folderId,
            userId,
            tenantId,
            displayName: version.displayName,
            description: descriptionOf(workflow.metadata) ?? undefined,
            trigger,
            schemaVersion: version.schemaVersion ?? null,
            notes: version.notes,
            cleared,
        })
    },
})

export async function connectionAvailability({ tenantId, projectId, trigger }: AvailabilityParams): Promise<(externalId: string) => boolean> {
    const referenced = [...new Set(collectConnectionIds(trigger))]
    if (referenced.length === 0) {
        return () => false
    }
    const connections = await connectionsRepo().find({
        where: { tenantId, externalId: In(referenced) },
        select: ['externalId', 'scope', 'projectIds'],
    })
    const available = new Set(connections
        .filter((connection) => connection.scope === ConnectionScope.TENANT || connection.projectIds.includes(projectId))
        .map((connection) => connection.externalId))
    return (externalId: string) => available.has(externalId)
}

export function collectConnectionIds(trigger: WorkflowTrigger): string[] {
    return workflowTransferUtils.collectConnectionIds(trigger)
}

async function createFromGraph(params: CreateFromGraphParams): Promise<WorkflowTransferResult> {
    const { log, projectId, folderId, userId, tenantId, displayName, description, trigger, schemaVersion, notes, cleared } = params
    if (!isNil(folderId)) {
        const folder = await folderRepo().findOneBy({ id: folderId, projectId })
        if (isNil(folder)) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'folderParentNotFound' } })
        }
    }
    await workflowNaming.assertCanAddWorkflows({ projectId, count: 1 })
    const uniqueName = await workflowNaming.uniqueName({ projectId, displayName: displayName.slice(0, WORKFLOW_NAME_MAX_LENGTH) })
    const migrated = await migrateWorkflowVersionTemplate({
        displayName: uniqueName,
        trigger,
        schemaVersion: schemaVersion ?? undefined,
        notes,
        valid: false,
    })
    const created = await workflowService(log).create({
        projectId,
        request: {
            displayName: uniqueName,
            projectId,
            ...(isNil(folderId) ? {} : { folderId }),
            ...(isNil(description) || description.length === 0 ? {} : { metadata: { description } }),
        },
        ownerId: userId,
    })
    await workflowService(log).update({
        id: created.id,
        projectId,
        tenantId,
        userId,
        operation: {
            type: WorkflowOperationType.IMPORT_WORKFLOW,
            request: {
                displayName: uniqueName,
                trigger: migrated.trigger,
                schemaVersion: migrated.schemaVersion,
                notes: migrated.notes,
            },
        },
    })
    return {
        workflowId: created.id,
        projectId,
        displayName: uniqueName,
        clearedConnections: cleared,
    }
}

function descriptionOf(metadata: unknown): string | null {
    if (typeof metadata !== 'object' || metadata === null || !('description' in metadata)) {
        return null
    }
    return typeof metadata.description === 'string' ? metadata.description : null
}

type ImportParams = {
    projectId: ProjectId
    folderId?: string
    file: WorkflowExportFile
    userId: UserId
    tenantId: TenantId
}

type CreateFromTriggerParams = {
    projectId: ProjectId
    userId: UserId
    tenantId: TenantId
    displayName: string
    description?: string
    trigger: WorkflowTrigger
    schemaVersion?: string | null
    notes?: Note[]
}

type ReplaceDraftParams = {
    projectId: ProjectId
    workflowId: string
    userId: UserId
    tenantId: TenantId
    displayName: string
    trigger: WorkflowTrigger
    schemaVersion?: string | null
    notes?: Note[]
}

type CopyParams = {
    sourceProjectId: ProjectId
    workflowId: string
    targetProjectId: ProjectId
    folderId?: string
    userId: UserId
    tenantId: TenantId
}

type AvailabilityParams = {
    tenantId: TenantId
    projectId: ProjectId
    trigger: WorkflowTrigger
}

type CreateFromGraphParams = {
    log: FastifyBaseLogger
    projectId: ProjectId
    folderId?: string
    userId: UserId
    tenantId: TenantId
    displayName: string
    description?: string
    trigger: WorkflowTrigger
    schemaVersion: string | null
    notes: Note[]
    cleared: number
}
