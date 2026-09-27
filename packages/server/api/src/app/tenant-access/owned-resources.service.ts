import { ApplicationError, ErrorCode, generateId, isNil } from '@fema-ipaas/core-utils'
import { DefaultProjectRole, ListOwnedResourcesRequestQuery, ListOwnedResourcesResponse, OwnedResource, OwnedResourceType, ProjectType, TransferResourcesResponse, UserStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { transaction } from '../core/db/transaction'
import { dataStoreRepo } from '../data-store/data-store.service'
import { databaseConnection } from '../database/database-connection'
import { mcpServiceRepo } from '../mcp-service/mcp-service.service'
import { projectMemberRepo } from '../project/project-member.repo'
import { projectRepo } from '../project/project-repo'
import { userRepo } from '../user/user-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'

export const ownedResourcesService = (log: FastifyBaseLogger) => ({
    async list({ tenantId, query }: ListParams): Promise<ListOwnedResourcesResponse> {
        const wants = (type: OwnedResourceType): boolean => isNil(query.type) || query.type === type
        const [projects, workflows, connections, mcpServices, dataStores] = await Promise.all([
            wants(OwnedResourceType.PROJECT) ? listProjects({ tenantId, ownerId: query.ownerId }) : [],
            wants(OwnedResourceType.WORKFLOW) ? listWorkflows({ tenantId, ownerId: query.ownerId }) : [],
            wants(OwnedResourceType.CONNECTION) ? listConnections({ tenantId, ownerId: query.ownerId }) : [],
            wants(OwnedResourceType.MCP_SERVICE) ? listProjectScoped({ tenantId, ownerId: query.ownerId, type: OwnedResourceType.MCP_SERVICE }) : [],
            wants(OwnedResourceType.DATA_STORE) ? listProjectScoped({ tenantId, ownerId: query.ownerId, type: OwnedResourceType.DATA_STORE }) : [],
        ])
        const search = query.search?.trim().toLowerCase() ?? ''
        const all = [...workflows, ...connections, ...mcpServices, ...dataStores, ...projects]
            .filter((resource) => search.length === 0 || resource.name.toLowerCase().includes(search))
            .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
        return {
            resources: all.slice(0, LIST_CAP),
            truncated: all.length > LIST_CAP,
        }
    },

    async countOwnedBy({ tenantId, ownerId }: OwnerParams): Promise<number> {
        const { resources } = await listAllOwnedBy({ tenantId, ownerId })
        return resources.length
    },

    async transfer({ tenantId, resources, toUserId, keepPreviousOwners }: TransferParams): Promise<TransferResourcesResponse> {
        const recipient = await userRepo().findOneBy({ id: toUserId, tenantId })
        if (isNil(recipient) || recipient.status !== UserStatus.ACTIVE) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'The recipient must be an active user of this tenant' },
            })
        }
        const idsOf = (type: OwnedResourceType): string[] => resources.filter((resource) => resource.type === type).map((resource) => resource.id)
        const projectIds = idsOf(OwnedResourceType.PROJECT)
        const workflowIds = idsOf(OwnedResourceType.WORKFLOW)
        const connectionIds = idsOf(OwnedResourceType.CONNECTION)
        const mcpServiceIds = idsOf(OwnedResourceType.MCP_SERVICE)
        const dataStoreIds = idsOf(OwnedResourceType.DATA_STORE)

        const tenantProjects = await projectRepo().find({ where: { tenantId, deleted: IsNull() }, select: ['id', 'ownerId', 'type'] })
        const tenantProjectIds = tenantProjects.map((project) => project.id)
        const projects = tenantProjects.filter((project) => projectIds.includes(project.id))
        const workflows = workflowIds.length === 0 || tenantProjectIds.length === 0 ? [] : await workflowRepo().find({
            where: { id: In(workflowIds), projectId: In(tenantProjectIds) },
            select: ['id', 'ownerId'],
        })
        const connections = connectionIds.length === 0 ? [] : await connectionsRepo().find({
            where: { id: In(connectionIds), tenantId },
            select: ['id', 'ownerId'],
        })
        const mcpServices = mcpServiceIds.length === 0 || tenantProjectIds.length === 0 ? [] : await mcpServiceRepo().find({
            where: { id: In(mcpServiceIds), projectId: In(tenantProjectIds) },
            select: ['id', 'ownerId'],
        })
        const dataStores = dataStoreIds.length === 0 || tenantProjectIds.length === 0 ? [] : await dataStoreRepo().find({
            where: { id: In(dataStoreIds), projectId: In(tenantProjectIds) },
            select: ['id', 'ownerId'],
        })
        const found = projects.length + workflows.length + connections.length + mcpServices.length + dataStores.length
        if (found !== resources.length) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'resource', entityId: 'one or more selected resources' },
            })
        }

        const movingProjects = projects.filter((project) => project.ownerId !== toUserId)
        const movingWorkflows = workflows.filter((workflow) => workflow.ownerId !== toUserId)
        const movingConnections = connections.filter((connection) => connection.ownerId !== toUserId)
        const movingMcpServices = mcpServices.filter((service) => service.ownerId !== toUserId)
        const movingDataStores = dataStores.filter((store) => store.ownerId !== toUserId)

        await transaction(async (entityManager) => {
            for (const project of movingProjects) {
                await projectRepo(entityManager).update({ id: project.id, tenantId }, {
                    ownerId: toUserId,
                    type: ProjectType.TEAM,
                })
                await projectMemberRepo(entityManager).delete({ projectId: project.id, userId: toUserId })
                const previousOwnerStays = keepPreviousOwners && await userRepo(entityManager).existsBy({ id: project.ownerId, tenantId })
                if (previousOwnerStays) {
                    await keepPreviousOwnerAsDeveloper({ projectId: project.id, userId: project.ownerId, entityManager })
                }
            }
            if (movingWorkflows.length > 0) {
                await workflowRepo(entityManager).update({ id: In(movingWorkflows.map((workflow) => workflow.id)) }, { ownerId: toUserId })
            }
            if (movingConnections.length > 0) {
                await connectionsRepo(entityManager).update({ id: In(movingConnections.map((connection) => connection.id)), tenantId }, { ownerId: toUserId })
            }
            if (movingMcpServices.length > 0) {
                await mcpServiceRepo(entityManager).update({ id: In(movingMcpServices.map((service) => service.id)) }, { ownerId: toUserId })
            }
            if (movingDataStores.length > 0) {
                await dataStoreRepo(entityManager).update({ id: In(movingDataStores.map((store) => store.id)) }, { ownerId: toUserId })
            }
        })
        const transferred = movingProjects.length + movingWorkflows.length + movingConnections.length + movingMcpServices.length + movingDataStores.length
        log.info({ tenant: { id: tenantId }, user: { id: toUserId }, transferredCount: transferred }, '[ownedResources] transferred ownership')
        return { transferred, skipped: resources.length - transferred }
    },

    async transferEverything({ tenantId, fromUserId, toUserId }: TransferEverythingParams): Promise<TransferResourcesResponse> {
        const { resources } = await listAllOwnedBy({ tenantId, ownerId: fromUserId })
        if (resources.length === 0) {
            return { transferred: 0, skipped: 0 }
        }
        return this.transfer({ tenantId, resources, toUserId, keepPreviousOwners: false })
    },
})

async function listAllOwnedBy({ tenantId, ownerId }: OwnerParams): Promise<{ resources: OwnedResource[] }> {
    const [projects, workflows, connections, mcpServices, dataStores] = await Promise.all([
        listProjects({ tenantId, ownerId }),
        listWorkflows({ tenantId, ownerId }),
        listConnections({ tenantId, ownerId }),
        listProjectScoped({ tenantId, ownerId, type: OwnedResourceType.MCP_SERVICE }),
        listProjectScoped({ tenantId, ownerId, type: OwnedResourceType.DATA_STORE }),
    ])
    return { resources: [...projects, ...workflows, ...connections, ...mcpServices, ...dataStores] }
}

async function listProjectScoped({ tenantId, ownerId, type }: ListProjectScopedParams): Promise<OwnedResource[]> {
    const table = type === OwnedResourceType.MCP_SERVICE ? 'mcp_service' : 'data_store'
    const rows = await databaseConnection().query<ProjectScopedRow[]>(
        `SELECT r.id, r.name, r."ownerId" AS "ownerId", r.updated, p."displayName" AS "projectName"
         FROM ${table} r
         JOIN project p ON p.id = r."projectId"
         WHERE p."tenantId" = $1 AND p.deleted IS NULL AND r."ownerId" IS NOT NULL AND ($2::varchar IS NULL OR r."ownerId" = $2)
         LIMIT ${ROW_CAP}`,
        [tenantId, ownerId ?? null],
    )
    return rows.map((row) => ({
        type,
        id: row.id,
        name: row.name,
        scope: row.projectName,
        ownerId: row.ownerId,
        updated: new Date(row.updated).toISOString(),
    }))
}

async function keepPreviousOwnerAsDeveloper({ projectId, userId, entityManager }: KeepPreviousOwnerParams): Promise<void> {
    const repo = projectMemberRepo(entityManager)
    const existing = await repo.findOneBy({ projectId, userId })
    if (!isNil(existing)) {
        return
    }
    await repo.save({
        id: generateId(),
        projectId,
        userId,
        role: DefaultProjectRole.DEVELOPER,
    })
}

async function listProjects({ tenantId, ownerId }: ListByOwnerParams): Promise<OwnedResource[]> {
    const rows = await databaseConnection().query<ProjectRow[]>(
        `SELECT p.id, p."displayName" AS "displayName", p."ownerId" AS "ownerId", p.type, p.updated
         FROM project p
         WHERE p."tenantId" = $1 AND p.deleted IS NULL AND ($2::varchar IS NULL OR p."ownerId" = $2)
           AND (p.type <> $3 OR EXISTS (SELECT 1 FROM workflow w WHERE w."projectId" = p.id))
         LIMIT ${ROW_CAP}`,
        [tenantId, ownerId ?? null, ProjectType.PERSONAL],
    )
    return rows.map((row) => ({
        type: OwnedResourceType.PROJECT,
        id: row.id,
        name: row.displayName,
        scope: row.type,
        ownerId: row.ownerId,
        updated: new Date(row.updated).toISOString(),
    }))
}

async function listWorkflows({ tenantId, ownerId }: ListByOwnerParams): Promise<OwnedResource[]> {
    const rows = await databaseConnection().query<WorkflowRow[]>(
        `SELECT w.id, w."ownerId" AS "ownerId", w.updated, p."displayName" AS "projectName",
            (SELECT v."displayName" FROM workflow_version v WHERE v."workflowId" = w.id ORDER BY v.created DESC LIMIT 1) AS name
         FROM workflow w
         JOIN project p ON p.id = w."projectId"
         WHERE p."tenantId" = $1 AND p.deleted IS NULL AND w."ownerId" IS NOT NULL AND ($2::varchar IS NULL OR w."ownerId" = $2)
         LIMIT ${ROW_CAP}`,
        [tenantId, ownerId ?? null],
    )
    return rows.map((row) => ({
        type: OwnedResourceType.WORKFLOW,
        id: row.id,
        name: row.name ?? row.id,
        scope: row.projectName,
        ownerId: row.ownerId,
        updated: new Date(row.updated).toISOString(),
    }))
}

async function listConnections({ tenantId, ownerId }: ListByOwnerParams): Promise<OwnedResource[]> {
    const connections = await connectionsRepo().find({
        where: isNil(ownerId) ? { tenantId } : { tenantId, ownerId },
        select: ['id', 'displayName', 'ownerId', 'scope', 'updated'],
        take: ROW_CAP,
    })
    return connections
        .filter((connection): connection is typeof connection & { ownerId: string } => !isNil(connection.ownerId))
        .map((connection) => ({
            type: OwnedResourceType.CONNECTION,
            id: connection.id,
            name: connection.displayName,
            scope: connection.scope,
            ownerId: connection.ownerId,
            updated: connection.updated,
        }))
}

const LIST_CAP = 1000
const ROW_CAP = 5000

type ProjectRow = {
    id: string
    displayName: string
    ownerId: string
    type: string
    updated: string
}

type ProjectScopedRow = {
    id: string
    name: string
    ownerId: string
    updated: string
    projectName: string
}

type ListProjectScopedParams = {
    tenantId: string
    ownerId: string | undefined
    type: OwnedResourceType.MCP_SERVICE | OwnedResourceType.DATA_STORE
}

type WorkflowRow = {
    id: string
    ownerId: string
    updated: string
    projectName: string
    name: string | null
}

type ListParams = {
    tenantId: string
    query: ListOwnedResourcesRequestQuery
}

type OwnerParams = {
    tenantId: string
    ownerId: string
}

type ListByOwnerParams = {
    tenantId: string
    ownerId: string | undefined
}

type TransferParams = {
    tenantId: string
    resources: { type: OwnedResourceType, id: string }[]
    toUserId: string
    keepPreviousOwners: boolean
}

type TransferEverythingParams = {
    tenantId: string
    fromUserId: string
    toUserId: string
}

type KeepPreviousOwnerParams = {
    projectId: string
    userId: string
    entityManager: Parameters<typeof projectMemberRepo>[0]
}
