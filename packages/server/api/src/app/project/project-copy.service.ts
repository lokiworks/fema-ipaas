import { generateId, isNil, ProjectId, TenantId, UserId } from '@fema-ipaas/core-utils'
import { ConnectionScope, CopyProjectResponse, DefaultProjectRole, Folder, PROJECT_NAME_MAX_LENGTH, ProjectType, WorkflowOperationType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { dataStoreService } from '../data-store/data-store.service'
import { mappingTableRepo } from '../mapping-table/mapping-table.service'
import { connectionAvailability } from '../project-workspace/workflow-transfer.service'
import { workflowTransferUtils } from '../project-workspace/workflow-transfer-utils'
import { connectionReplacementRepo } from '../release/connection-replacement.service'
import { variableRepo } from '../variable/variable.service'
import { folderRepo } from '../workflows/folder/folder.service'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowService } from '../workflows/workflow/workflow.service'
import { projectCopyUtils } from './project-copy-utils'
import { projectMemberService } from './project-member.service'
import { projectService } from './project-service'

export const projectCopyService = (log: FastifyBaseLogger) => ({
    async copy({ sourceProjectId, tenantId, userId, displayName }: CopyParams): Promise<CopyProjectResponse> {
        const source = await projectService(log).getOneOrThrow(sourceProjectId)
        const name = displayName.trim().slice(0, PROJECT_NAME_MAX_LENGTH)
        await projectService(log).assertDisplayNameAvailable({ tenantId, displayName: name })
        const target = await projectService(log).create({
            ownerId: userId,
            displayName: name,
            type: ProjectType.TEAM,
            tenantId,
            description: source.description ?? null,
            icon: source.icon,
        })
        await projectService(log).update(target.id, {
            type: ProjectType.TEAM,
            releasesEnabled: source.releasesEnabled,
            releaseApproverIds: source.releasesEnabled ? [userId] : [],
            workflowsLimit: source.workflowsLimit ?? null,
            monthlyRunsLimit: source.monthlyRunsLimit ?? null,
        })
        await projectMemberService(log).upsert({ projectId: target.id, userId, role: DefaultProjectRole.ADMIN })

        const folderMap = await copyFolders({ sourceProjectId, targetProjectId: target.id })
        const variables = await copyVariables({ sourceProjectId, targetProjectId: target.id, tenantId, userId })
        const tableMap = await copyMappingTables({ sourceProjectId, targetProjectId: target.id, userId })
        const dataStores = await dataStoreService(log).copyStructure({ sourceProjectId, targetProjectId: target.id, ownerId: userId })
        await copyConnectionReplacements({ sourceProjectId, targetProjectId: target.id })
        const workflows = await copyWorkflows({ log, sourceProjectId, targetProjectId: target.id, tenantId, userId, folderMap, tableMap })

        return {
            projectId: target.id,
            displayName: target.displayName,
            copied: {
                workflows: workflows.copied,
                folders: folderMap.size,
                variables,
                mappingTables: tableMap.size,
                dataStores,
            },
            clearedConnections: workflows.cleared,
        }
    },
})

async function copyFolders({ sourceProjectId, targetProjectId }: { sourceProjectId: ProjectId, targetProjectId: ProjectId }): Promise<Map<string, string>> {
    const folders: Folder[] = await folderRepo().findBy({ projectId: sourceProjectId })
    const ordered = projectCopyUtils.orderFoldersParentFirst(folders)
    const idMap = new Map(ordered.map((folder) => [folder.id, generateId()]))
    for (const folder of ordered) {
        const newId = idMap.get(folder.id)
        if (isNil(newId)) {
            continue
        }
        await folderRepo().insert({
            id: newId,
            projectId: targetProjectId,
            displayName: folder.displayName,
            displayOrder: folder.displayOrder,
            externalId: newId,
            parentId: isNil(folder.parentId) ? null : idMap.get(folder.parentId) ?? null,
        })
    }
    return idMap
}

async function copyVariables({ sourceProjectId, targetProjectId, tenantId, userId }: CopyRowsParams & { tenantId: TenantId }): Promise<number> {
    const variables = await variableRepo().findBy({ projectId: sourceProjectId })
    for (const variable of variables) {
        await variableRepo().save({
            id: generateId(),
            name: variable.name,
            projectId: targetProjectId,
            tenantId,
            ownerId: userId,
            value: variable.value,
            testValue: variable.testValue,
            metadata: variable.metadata,
        })
    }
    return variables.length
}

async function copyMappingTables({ sourceProjectId, targetProjectId, userId }: CopyRowsParams): Promise<Map<string, string>> {
    const tables = await mappingTableRepo().findBy({ projectId: sourceProjectId })
    const idMap = new Map(tables.map((table) => [table.id, generateId()]))
    for (const table of tables) {
        await mappingTableRepo().insert({
            id: idMap.get(table.id) ?? generateId(),
            projectId: targetProjectId,
            name: table.name,
            description: table.description,
            keyLabel: table.keyLabel,
            valueLabel: table.valueLabel,
            missingBehavior: table.missingBehavior,
            defaultValue: table.defaultValue,
            rows: table.rows,
            updatedById: userId,
        })
    }
    return idMap
}

async function copyConnectionReplacements({ sourceProjectId, targetProjectId }: { sourceProjectId: ProjectId, targetProjectId: ProjectId }): Promise<void> {
    const replacements = await connectionReplacementRepo().findBy({ projectId: sourceProjectId })
    if (replacements.length === 0) {
        return
    }
    const ids = [...new Set(replacements.flatMap((replacement) => [replacement.sourceConnectionId, replacement.targetConnectionId]))]
    const tenantWide = new Set((await connectionsRepo().find({ where: { id: In(ids) }, select: ['id', 'scope'] }))
        .filter((connection) => connection.scope === ConnectionScope.TENANT)
        .map((connection) => connection.id))
    for (const replacement of replacements) {
        if (tenantWide.has(replacement.sourceConnectionId) && tenantWide.has(replacement.targetConnectionId)) {
            await connectionReplacementRepo().insert({
                id: generateId(),
                projectId: targetProjectId,
                sourceConnectionId: replacement.sourceConnectionId,
                targetConnectionId: replacement.targetConnectionId,
            })
        }
    }
}

async function copyWorkflows(params: CopyWorkflowsParams): Promise<{ copied: number, cleared: number }> {
    const { log, sourceProjectId, targetProjectId, tenantId, userId, folderMap, tableMap } = params
    const sources = await workflowRepo().find({ where: { projectId: sourceProjectId }, select: ['id', 'folderId', 'metadata'] })
    let copied = 0
    let cleared = 0
    for (const source of sources) {
        const populated = await workflowService(log).getOnePopulated({ id: source.id, projectId: sourceProjectId })
        if (isNil(populated)) {
            continue
        }
        const version = await workflowVersionService(log).getWorkflowVersionOrThrow({
            workflowId: source.id,
            versionId: populated.version.id,
            removeSampleData: true,
            projectId: sourceProjectId,
        })
        const isAvailable = await connectionAvailability({ tenantId, projectId: targetProjectId, trigger: version.trigger })
        const stripped = workflowTransferUtils.stripUnavailableConnections({ trigger: version.trigger, isAvailable })
        const trigger = workflowTransferUtils.remapIds({ trigger: stripped.trigger, idMap: tableMap })
        const folderId = isNil(source.folderId) ? undefined : folderMap.get(source.folderId)
        const created = await workflowService(log).create({
            projectId: targetProjectId,
            request: {
                displayName: version.displayName,
                projectId: targetProjectId,
                ...(isNil(folderId) ? {} : { folderId }),
                ...(isNil(source.metadata) ? {} : { metadata: source.metadata }),
            },
            ownerId: userId,
            emitEvents: false,
        })
        await workflowService(log).update({
            id: created.id,
            projectId: targetProjectId,
            tenantId,
            userId,
            emitEvents: false,
            operation: {
                type: WorkflowOperationType.IMPORT_WORKFLOW,
                request: {
                    displayName: created.version.displayName,
                    trigger,
                    schemaVersion: version.schemaVersion,
                    notes: version.notes,
                },
            },
        })
        copied += 1
        cleared += stripped.cleared
    }
    return { copied, cleared }
}

type CopyParams = {
    sourceProjectId: ProjectId
    tenantId: TenantId
    userId: UserId
    displayName: string
}

type CopyRowsParams = {
    sourceProjectId: ProjectId
    targetProjectId: ProjectId
    userId: UserId
}

type CopyWorkflowsParams = {
    log: FastifyBaseLogger
    sourceProjectId: ProjectId
    targetProjectId: ProjectId
    tenantId: TenantId
    userId: UserId
    folderMap: Map<string, string>
    tableMap: Map<string, string>
}
