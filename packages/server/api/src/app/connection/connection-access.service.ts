import { ApplicationError, ErrorCode, isNil, unique } from '@fema-ipaas/core-utils'
import { connectionAccessUtils, ConnectionPermission, ConnectionScope, ConnectionShare, PrincipalType, TenantRole } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { projectMemberRepo } from '../project/project-member.repo'
import { projectRepo } from '../project/project-repo'
import { userRepo } from '../user/user-service'
import { ConnectionShareEntity, ConnectionShareSchema } from './connection-share.entity'
import { ConnectionSchema } from './connection.entity'

export const connectionShareRepo = repoFactory(ConnectionShareEntity)

export const connectionAccessService = (log: FastifyBaseLogger) => ({
    async memberProjectIds({ userId, tenantId }: UserRef): Promise<string[]> {
        const user = await userRepo().findOneBy({ id: userId, tenantId })
        if (isNil(user)) {
            return []
        }
        if (user.tenantRole === TenantRole.ADMIN) {
            const projects = await projectRepo().find({ where: { tenantId, deleted: IsNull() }, select: ['id'] })
            return projects.map((project) => project.id)
        }
        const [owned, memberships] = await Promise.all([
            projectRepo().find({ where: { tenantId, ownerId: userId, deleted: IsNull() }, select: ['id'] }),
            projectMemberRepo().find({ where: { userId }, select: ['projectId'] }),
        ])
        const memberIds = memberships.map((membership) => membership.projectId)
        const liveMemberProjects = memberIds.length === 0
            ? []
            : await projectRepo().find({ where: { id: In(memberIds), tenantId, deleted: IsNull() }, select: ['id'] })
        return unique([...owned.map((project) => project.id), ...liveMemberProjects.map((project) => project.id)])
    },

    async isTenantAdmin({ userId, tenantId }: UserRef): Promise<boolean> {
        const user = await userRepo().findOneBy({ id: userId, tenantId })
        return !isNil(user) && user.tenantRole === TenantRole.ADMIN
    },

    async sharesForUser({ userId, connectionIds }: { userId: string, connectionIds: string[] }): Promise<ConnectionShareSchema[]> {
        if (connectionIds.length === 0) {
            return []
        }
        return connectionShareRepo().find({ where: { userId, connectionId: In(connectionIds) } })
    },

    async permissionsFor({ connections, userId, tenantId }: PermissionsForParams): Promise<Map<string, ConnectionPermission | null>> {
        const [memberProjectIds, shares] = await Promise.all([
            this.memberProjectIds({ userId, tenantId }),
            this.sharesForUser({ userId, connectionIds: connections.map((connection) => connection.id) }),
        ])
        return new Map(connections.map((connection) => [connection.id, connectionAccessUtils.resolvePermission({
            connection,
            userId,
            shares,
            memberProjectIds,
        })]))
    },

    async permissionFor({ connection, principal }: PermissionForParams): Promise<ConnectionPermission | null> {
        if (principal.type !== PrincipalType.USER) {
            return ConnectionPermission.OWNER
        }
        const permissions = await this.permissionsFor({ connections: [connection], userId: principal.id, tenantId: principal.tenantId })
        return permissions.get(connection.id) ?? null
    },

    async assertCanManage({ connection, principal }: PermissionForParams): Promise<ConnectionPermission> {
        const permission = await this.permissionFor({ connection, principal })
        if (!connectionAccessUtils.canManage(permission) || isNil(permission)) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Only the owner or members with edit access can change this connection' },
            })
        }
        return permission
    },

    async assertCanUse({ connection, principal }: PermissionForParams): Promise<void> {
        const permission = await this.permissionFor({ connection, principal })
        if (!connectionAccessUtils.canUse(permission)) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'This connection is not shared with you' },
            })
        }
    },

    async assertVisible({ connection, principal }: PermissionForParams): Promise<void> {
        const permission = await this.permissionFor({ connection, principal })
        if (!connectionAccessUtils.canUse(permission)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'Connection', entityId: connection.id },
            })
        }
    },

    async assertOwner({ connection, principal }: PermissionForParams): Promise<void> {
        const permission = await this.permissionFor({ connection, principal })
        if (permission !== ConnectionPermission.OWNER) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Only the owner can delete this connection' },
            })
        }
    },

    async projectToActIn({ connection, principal }: PermissionForParams): Promise<string> {
        const permission = await this.permissionFor({ connection, principal })
        if (!connectionAccessUtils.canUse(permission)) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'This connection is not shared with you' },
            })
        }
        const candidates = principal.type === PrincipalType.USER
            ? await this.memberProjectIds({ userId: principal.id, tenantId: principal.tenantId })
            : (await projectRepo().find({ where: { tenantId: principal.tenantId, deleted: IsNull() }, select: ['id'] })).map((project) => project.id)
        const projectId = candidates.find((candidate) => connectionAccessUtils.isAvailableInProject({ connection, projectId: candidate }))
        if (isNil(projectId)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'This connection is not available in any of your projects' },
            })
        }
        return projectId
    },

    async listShares({ connectionId }: { connectionId: string }): Promise<ConnectionShare[]> {
        const shares = await connectionShareRepo()
            .createQueryBuilder('share')
            .leftJoinAndSelect('share.user', 'user')
            .leftJoinAndSelect('user.identity', 'identity')
            .where('share."connectionId" = :connectionId', { connectionId })
            .orderBy('share.created', 'ASC')
            .getMany()
        return shares.map(toShareModel)
    },

    async countShares({ connectionIds }: { connectionIds: string[] }): Promise<Map<string, number>> {
        if (connectionIds.length === 0) {
            return new Map()
        }
        const rows = await connectionShareRepo()
            .createQueryBuilder('share')
            .select('share."connectionId"', 'connectionId')
            .addSelect('COUNT(*)', 'count')
            .where('share."connectionId" IN (:...connectionIds)', { connectionIds })
            .groupBy('share."connectionId"')
            .getRawMany<{ connectionId: string, count: string }>()
        return new Map(rows.map((row) => [row.connectionId, Number(row.count)]))
    },

    async assertUsableInProject({ externalIds, projectId, tenantId, userId, connections }: AssertUsableParams): Promise<void> {
        if (externalIds.length === 0) {
            return
        }
        const referenced = connections.filter((connection) => externalIds.includes(connection.externalId)
            && connectionAccessUtils.isAvailableInProject({ connection, projectId }))
        if (referenced.length === 0) {
            return
        }
        const permissions = await this.permissionsFor({ connections: referenced, userId, tenantId })
        const blocked = referenced.filter((connection) => !connectionAccessUtils.canUse(permissions.get(connection.id) ?? null))
        if (blocked.length > 0) {
            log.info({ project: { id: projectId }, user: { id: userId }, blockedCount: blocked.length }, '[connectionAccessService#assertUsableInProject] Rejected a step connection the editor cannot use')
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `Connection ${blocked.map((connection) => `"${connection.displayName}"`).join(', ')} is not shared with you`,
                },
            })
        }
    },
})

export const connectionScopeHelper = {
    toScopeFields,
}

function toShareModel(share: ConnectionShareSchema): ConnectionShare {
    const identity = share.user?.identity
    return {
        id: share.id,
        created: share.created,
        updated: share.updated,
        tenantId: share.tenantId,
        connectionId: share.connectionId,
        userId: share.userId,
        permission: share.permission,
        user: isNil(identity) ? null : {
            id: share.userId,
            email: identity.email,
            firstName: identity.firstName,
            lastName: identity.lastName,
        },
    }
}

function toScopeFields({ allProjects, projectIds, current }: ToScopeFieldsParams): Pick<ConnectionSchema, 'scope' | 'preSelectForNewProjects' | 'projectIds'> {
    if (allProjects) {
        return { scope: ConnectionScope.TENANT, preSelectForNewProjects: true, projectIds: current?.projectIds ?? projectIds }
    }
    return { scope: ConnectionScope.PROJECT, preSelectForNewProjects: false, projectIds: unique(projectIds) }
}

type UserRef = {
    userId: string
    tenantId: string
}

type AccessConnection = Pick<ConnectionSchema, 'id' | 'scope' | 'projectIds' | 'preSelectForNewProjects' | 'projectMembersPermission'> & {
    ownerId?: string | null
}

type PermissionsForParams = {
    connections: AccessConnection[]
    userId: string
    tenantId: string
}

type PermissionForParams = {
    connection: AccessConnection
    principal: {
        id: string
        type: PrincipalType
        tenantId: string
    }
}

type AssertUsableParams = {
    externalIds: string[]
    projectId: string
    tenantId: string
    userId: string
    connections: (AccessConnection & Pick<ConnectionSchema, 'externalId' | 'displayName'>)[]
}

type ToScopeFieldsParams = {
    allProjects: boolean
    projectIds: string[]
    current?: Pick<ConnectionSchema, 'projectIds'>
}
