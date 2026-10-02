import { ApplicationError, ErrorCode, generateId, isNil, SeekPage, unique } from '@fema-ipaas/core-utils'
import { AccessibleConnection, AddConnectionSharesRequestBody, connectionAccessUtils, ConnectionDetail, ConnectionOwnershipFilter, ConnectionPermission, ConnectionScope, ConnectionScopeImpact, ConnectionScopeImpactRequestBody, ConnectionShare, ConnectionSharePermission, ConnectionStatus, ListAccessibleConnectionsRequestQuery, NotificationType, PrincipalType, RemindConnectionOwnerResponse, UpdateConnectionAccessRequestBody, UserWithMetaInformation } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { In } from 'typeorm'
import { distributedStore } from '../database/redis-connections'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { notificationService } from '../notification/notification.service'
import { userRepo } from '../user/user-service'
import { connectionAccessService, connectionScopeHelper, connectionShareRepo } from './connection-access.service'
import { connectionReferenceService } from './connection-reference.service'
import { connectionAvailability } from './connection-service/connection-availability'
import { connectionsRepo } from './connection-service/connection-service'
import { ConnectionEntity, ConnectionSchema } from './connection.entity'

export const connectionShareService = (log: FastifyBaseLogger) => ({
    async listAccessible({ tenantId, userId, query }: ListAccessibleParams): Promise<SeekPage<AccessibleConnection>> {
        const memberProjectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
        const decodedCursor = paginationHelper.decodeCursor(query.cursor ?? null)
        const paginator = buildPaginator({
            entity: ConnectionEntity,
            query: {
                limit: query.limit ?? DEFAULT_PAGE_SIZE,
                order: 'DESC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const builder = connectionsRepo()
            .createQueryBuilder('connection')
            .leftJoinAndSelect('connection.owner', 'owner')
            .leftJoinAndSelect('owner.identity', 'owner_identity')
            .where('connection."tenantId" = :tenantId', { tenantId })
            .andWhere(ACCESSIBLE_SQL, {
                accessUserId: userId,
                memberProjectIds,
                hasMemberProjects: memberProjectIds.length > 0,
            })
        if (!isNil(query.search) && query.search.trim().length > 0) {
            builder.andWhere('(connection."displayName" ILIKE :search OR connection."connectorName" ILIKE :search OR connection."metadata"->>\'accountIdentifier\' ILIKE :search)', { search: `%${query.search.trim()}%` })
        }
        if (!isNil(query.connectorName)) {
            builder.andWhere('connection."connectorName" = :connectorName', { connectorName: query.connectorName })
        }
        if (!isNil(query.status) && query.status.length > 0) {
            builder.andWhere('connection."status" IN (:...statuses)', { statuses: query.status })
        }
        if (!isNil(query.availableInProjectId)) {
            builder.andWhere(connectionAvailability.sqlAvailableIn({ alias: 'connection', param: 'availableInProjectId' }), { availableInProjectId: query.availableInProjectId })
        }
        if (query.ownership === ConnectionOwnershipFilter.MINE) {
            builder.andWhere('connection."ownerId" = :ownerFilterId', { ownerFilterId: userId })
        }
        if (query.ownership === ConnectionOwnershipFilter.SHARED) {
            builder.andWhere('(connection."ownerId" IS NULL OR connection."ownerId" <> :ownerFilterId)', { ownerFilterId: userId })
        }
        const { data, cursor } = await paginator.paginate(builder)
        const enriched = await this.enrich({ tenantId, userId, connections: data, memberProjectIds })
        return paginationHelper.createPage(enriched, cursor)
    },

    async enrich({ tenantId, userId, connections, memberProjectIds }: EnrichParams): Promise<AccessibleConnection[]> {
        const [shares, shareCounts, references] = await Promise.all([
            connectionAccessService(log).sharesForUser({ userId, connectionIds: connections.map((connection) => connection.id) }),
            connectionAccessService(log).countShares({ connectionIds: connections.map((connection) => connection.id) }),
            connectionReferenceService(log).workflowReferences({ tenantId, connections }),
        ])
        const projects = await connectionReferenceService(log).projectRefs({ tenantId, projectIds: unique(connections.flatMap((connection) => connection.projectIds)) })
        return connections.flatMap((connection) => {
            const permission = connectionAccessUtils.resolvePermission({ connection, userId, shares, memberProjectIds })
            if (isNil(permission)) {
                return []
            }
            const allProjects = connectionAccessUtils.isAvailableToAllProjects(connection)
            return [{
                ...toPublic(connection),
                myPermission: permission,
                allProjects,
                projects: allProjects ? [] : connection.projectIds.flatMap((projectId) => {
                    const project = projects.get(projectId)
                    return isNil(project) ? [] : [project]
                }),
                shareCount: shareCounts.get(connection.id) ?? 0,
                projectMembersPermission: connection.projectMembersPermission ?? null,
                workflowIds: (references.get(connection.id) ?? []).map((reference) => reference.workflowId),
            }]
        })
    },

    async detail({ tenantId, userId, id }: ConnectionRef): Promise<ConnectionDetail> {
        const connection = await findConnectionOrThrow({ tenantId, id })
        const memberProjectIds = await connectionAccessService(log).memberProjectIds({ userId, tenantId })
        const [accessible] = await this.enrich({ tenantId, userId, connections: [connection], memberProjectIds })
        if (isNil(accessible)) {
            throw notFound(id)
        }
        const [references, shares] = await Promise.all([
            connectionReferenceService(log).references({ tenantId, connection, memberProjectIds }),
            connectionAccessService(log).listShares({ connectionId: id }),
        ])
        return { ...accessible, references, shares }
    },

    async remindOwner({ tenantId, userId, id }: ConnectionRef): Promise<RemindConnectionOwnerResponse> {
        const detail = await this.detail({ tenantId, userId, id })
        const connection = await findConnectionOrThrow({ tenantId, id })
        const ownerId = connection.ownerId
        if (isNil(ownerId) || ownerId === userId) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'Only a member who does not own the connection can remind its owner' } })
        }
        if (connection.status === ConnectionStatus.ACTIVE) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'The connection works, there is nothing to reconnect' } })
        }
        const ownerDisplayName = detail.owner?.firstName ?? detail.owner?.email ?? ''
        const reminded = await distributedStore.runOnceWithin(`connection-reauth-reminded:${connection.id}:${userId}`, REMIND_WINDOW_SECONDS, async () => {
            await notificationService(log).notify({
                tenantId,
                projectId: null,
                recipientIds: [ownerId],
                type: NotificationType.CONNECTION_REAUTH_REQUESTED,
                title: connection.displayName,
                body: connection.connectorName,
                link: connection.scope === ConnectionScope.TENANT || isNil(connection.projectIds[0]) ? `/tenant/connections?id=${connection.id}` : `/projects/${connection.projectIds[0]}/connections?id=${connection.id}`,
                actorId: userId,
            })
        })
        return { reminded, ownerDisplayName }
    },

    async addShares({ tenantId, principal, id, request }: AddSharesParams): Promise<AddSharesResult> {
        const connection = await findConnectionOrThrow({ tenantId, id })
        await connectionAccessService(log).assertCanManage({ connection, principal })
        const users = await userRepo().find({ where: { id: In(request.userIds), tenantId }, relations: { identity: true } })
        const targets = users.filter((user) => user.id !== connection.ownerId)
        const existing = await connectionShareRepo().find({ where: { connectionId: id, userId: In(targets.map((user) => user.id)) } })
        const now = dayjs().toISOString()
        const toInsert = targets.filter((user) => !existing.some((share) => share.userId === user.id))
        if (toInsert.length > 0) {
            await connectionShareRepo().insert(toInsert.map((user) => ({
                id: generateId(),
                created: now,
                updated: now,
                tenantId,
                connectionId: id,
                userId: user.id,
                permission: request.permission,
                createdBy: principal.type === PrincipalType.USER ? principal.id : null,
            })))
        }
        const toUpdate = existing.filter((share) => share.permission !== request.permission)
        if (toUpdate.length > 0) {
            await connectionShareRepo().update({ id: In(toUpdate.map((share) => share.id)) }, { permission: request.permission })
        }
        log.info({ connection: { id }, addedCount: toInsert.length, updatedCount: toUpdate.length }, '[connectionShareService#addShares] Connection shared')
        return {
            connection,
            shares: await connectionAccessService(log).listShares({ connectionId: id }),
            changed: [...toInsert, ...users.filter((user) => toUpdate.some((share) => share.userId === user.id))].map((user) => ({
                userId: user.id,
                email: user.identity?.email ?? '',
                change: toInsert.some((inserted) => inserted.id === user.id) ? 'ADDED' : 'UPDATED',
            })),
        }
    },

    async updateShare({ tenantId, principal, id, userId, permission }: UpdateShareParams): Promise<ShareChangeResult> {
        const connection = await findConnectionOrThrow({ tenantId, id })
        await connectionAccessService(log).assertCanManage({ connection, principal })
        assertNotSelf({ principal, userId })
        const share = await connectionShareRepo().findOneBy({ connectionId: id, userId })
        if (isNil(share)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'ConnectionShare', entityId: userId } })
        }
        await connectionShareRepo().update({ id: share.id }, { permission })
        return { connection, shares: await connectionAccessService(log).listShares({ connectionId: id }), email: await emailOf(userId) }
    },

    async removeShare({ tenantId, principal, id, userId }: RemoveShareParams): Promise<ShareChangeResult> {
        const connection = await findConnectionOrThrow({ tenantId, id })
        await connectionAccessService(log).assertCanManage({ connection, principal })
        assertNotSelf({ principal, userId })
        await connectionShareRepo().delete({ connectionId: id, userId })
        return { connection, shares: await connectionAccessService(log).listShares({ connectionId: id }), email: await emailOf(userId) }
    },

    async scopeImpact({ tenantId, principal, id, request }: ScopeImpactParams): Promise<ConnectionScopeImpact> {
        const connection = await findConnectionOrThrow({ tenantId, id })
        await connectionAccessService(log).assertCanManage({ connection, principal })
        const next = { ...connection, ...connectionScopeHelper.toScopeFields({ allProjects: request.allProjects, projectIds: request.projectIds, current: connection }) }
        const references = (await connectionReferenceService(log).workflowReferences({ tenantId, connections: [connection] })).get(connection.id) ?? []
        const lost = references.filter((reference) => !connectionAccessUtils.isAvailableInProject({ connection: next, projectId: reference.projectId }))
        const memberProjectIds = principal.type === PrincipalType.USER
            ? await connectionAccessService(log).memberProjectIds({ userId: principal.id, tenantId })
            : unique(lost.map((reference) => reference.projectId))
        const visible = lost.filter((reference) => memberProjectIds.includes(reference.projectId))
        return { lostWorkflows: visible, hiddenLostWorkflowCount: lost.length - visible.length }
    },

    async updateAccess({ tenantId, principal, id, request }: UpdateAccessParams): Promise<UpdateAccessResult> {
        const connection = await findConnectionOrThrow({ tenantId, id })
        const permission = await connectionAccessService(log).assertCanManage({ connection, principal })
        const wantsAllProjects = request.allProjects && !connectionAccessUtils.isAvailableToAllProjects(connection)
        if (wantsAllProjects && principal.type === PrincipalType.USER && !(await connectionAccessService(log).isTenantAdmin({ userId: principal.id, tenantId }))) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Only tenant admins can make a connection available to all projects' },
            })
        }
        if (!request.allProjects && principal.type === PrincipalType.USER) {
            const memberProjectIds = await connectionAccessService(log).memberProjectIds({ userId: principal.id, tenantId })
            const added = request.projectIds.filter((projectId) => !connection.projectIds.includes(projectId))
            if (added.some((projectId) => !memberProjectIds.includes(projectId))) {
                throw new ApplicationError({
                    code: ErrorCode.AUTHORIZATION,
                    params: { message: 'You can only add projects you are a member of' },
                })
            }
        }
        const projectMembersChanged = (request.projectMembersPermission ?? null) !== (connection.projectMembersPermission ?? null)
        if (projectMembersChanged && permission !== ConnectionPermission.OWNER) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Only the owner can change what project members may do with this connection' },
            })
        }
        const scopeFields = connectionScopeHelper.toScopeFields({ allProjects: request.allProjects, projectIds: request.projectIds, current: connection })
        await connectionsRepo().update({ id, tenantId }, {
            ...scopeFields,
            projectMembersPermission: request.projectMembersPermission ?? null,
        })
        const updated = await findConnectionOrThrow({ tenantId, id })
        return { connection: updated, projectMembersChanged }
    },
})

function toPublic(connection: ConnectionSchema): Omit<AccessibleConnection, 'myPermission' | 'allProjects' | 'projects' | 'shareCount' | 'projectMembersPermission'> {
    return {
        id: connection.id,
        created: connection.created,
        updated: connection.updated,
        externalId: connection.externalId,
        displayName: connection.displayName,
        type: connection.type,
        connectorName: connection.connectorName,
        connectorVersion: connection.connectorVersion,
        projectIds: connection.projectIds,
        tenantId: connection.tenantId,
        scope: connection.scope,
        status: connection.status,
        ownerId: connection.ownerId,
        owner: toOwner(connection.owner),
        metadata: connection.metadata,
        preSelectForNewProjects: connection.preSelectForNewProjects,
        workflowIds: null,
    }
}

function toOwner(owner: ConnectionSchema['owner']): UserWithMetaInformation | null {
    const identity = owner?.identity
    if (isNil(owner) || isNil(identity)) {
        return null
    }
    return {
        id: owner.id,
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
        tenantId: owner.tenantId,
        tenantRole: owner.tenantRole,
        status: owner.status,
        externalId: owner.externalId,
        created: owner.created,
        updated: owner.updated,
    }
}

async function findConnectionOrThrow({ tenantId, id }: { tenantId: string, id: string }): Promise<ConnectionSchema> {
    const connection = await connectionsRepo().findOne({
        where: { id, tenantId },
        relations: { owner: { identity: true } },
    })
    if (isNil(connection)) {
        throw notFound(id)
    }
    return connection
}

function notFound(id: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'Connection', entityId: id } })
}

function assertNotSelf({ principal, userId }: { principal: SharePrincipal, userId: string }): void {
    if (principal.type === PrincipalType.USER && principal.id === userId) {
        throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: 'You cannot change your own access to a connection' } })
    }
}

async function emailOf(userId: string): Promise<string> {
    const user = await userRepo().findOne({ where: { id: userId }, relations: { identity: true } })
    return user?.identity?.email ?? ''
}

const DEFAULT_PAGE_SIZE = 20
const REMIND_WINDOW_SECONDS = 6 * 60 * 60

const ACCESSIBLE_SQL = [
    '(connection."ownerId" = :accessUserId',
    'OR EXISTS (SELECT 1 FROM "connection_share" "access_share" WHERE "access_share"."connectionId" = connection."id" AND "access_share"."userId" = :accessUserId)',
    'OR (connection."projectMembersPermission" IS NOT NULL AND ((:hasMemberProjects AND connection."scope" = \'TENANT\' AND connection."preSelectForNewProjects" = true) OR connection."projectIds" && :memberProjectIds::varchar[])))',
].join(' ')

type SharePrincipal = {
    id: string
    type: PrincipalType
    tenantId: string
}

type ListAccessibleParams = {
    tenantId: string
    userId: string
    query: ListAccessibleConnectionsRequestQuery
}

type EnrichParams = {
    tenantId: string
    userId: string
    connections: ConnectionSchema[]
    memberProjectIds: string[]
}

type ConnectionRef = {
    tenantId: string
    userId: string
    id: string
}

type AddSharesParams = {
    tenantId: string
    principal: SharePrincipal
    id: string
    request: AddConnectionSharesRequestBody
}

type AddSharesResult = {
    connection: ConnectionSchema
    shares: ConnectionShare[]
    changed: { userId: string, email: string, change: 'ADDED' | 'UPDATED' }[]
}

type UpdateShareParams = {
    tenantId: string
    principal: SharePrincipal
    id: string
    userId: string
    permission: ConnectionSharePermission
}

type RemoveShareParams = Omit<UpdateShareParams, 'permission'>

type ShareChangeResult = {
    connection: ConnectionSchema
    shares: ConnectionShare[]
    email: string
}

type ScopeImpactParams = {
    tenantId: string
    principal: SharePrincipal
    id: string
    request: ConnectionScopeImpactRequestBody
}

type UpdateAccessParams = {
    tenantId: string
    principal: SharePrincipal
    id: string
    request: UpdateConnectionAccessRequestBody
}

type UpdateAccessResult = {
    connection: ConnectionSchema
    projectMembersChanged: boolean
}
