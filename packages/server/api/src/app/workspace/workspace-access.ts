import { ApplicationError, ErrorCode, isNil, Permission, RoleType, WorkspaceRole } from '@fema-ipaas/core-utils'
import { DefaultWorkspaceRole, Principal, PrincipalType, rolePermissions, TenantRole } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { userService } from '../user/user-service'
import { workspaceMemberRepo } from './workspace-member.repo'
import { workspaceService } from './workspace-service'

function buildRole(name: DefaultWorkspaceRole): WorkspaceRole {
    return {
        id: name,
        created: EPOCH,
        updated: EPOCH,
        name,
        permissions: rolePermissions[name],
        tenantId: null,
        type: RoleType.DEFAULT,
    }
}

const EPOCH = new Date(0).toISOString()

function denied(message: string): never {
    throw new ApplicationError({
        code: ErrorCode.AUTHORIZATION,
        params: { message },
    })
}

export const workspaceAccess = (log: FastifyBaseLogger) => ({
    async assertPrincipalCanAccessWorkspace({ principal, workspaceId, permission }: AssertParams): Promise<void> {
        if (isNil(workspaceId)) {
            denied('Workspace ID is required')
        }
        const workspace = await workspaceService(log).getOne(workspaceId)
        const tenantId = 'tenant' in principal ? principal.tenant.id : undefined
        if (isNil(workspace) || isNil(tenantId) || workspace.tenantId !== tenantId) {
            denied('User not allowed to access this workspace')
        }
        if (principal.type !== PrincipalType.USER) {
            return
        }
        const role = await this.resolveRole({ userId: principal.id, workspaceId })
        if (isNil(role)) {
            denied('User not allowed to access this workspace')
        }
        if (!isNil(permission) && !role.permissions.includes(permission)) {
            denied(`Role ${role.name} is missing permission ${permission}`)
        }
    },

    async resolveRole({ userId, workspaceId }: ResolveRoleParams): Promise<WorkspaceRole | null> {
        const workspace = await workspaceService(log).getOne(workspaceId)
        if (isNil(workspace)) {
            return null
        }
        if (workspace.ownerId === userId) {
            return buildRole(DefaultWorkspaceRole.ADMIN)
        }
        const user = await userService(log).getOneOrFail({ id: userId })
        if (user.tenantId !== workspace.tenantId) {
            return null
        }
        if (user.tenantRole === TenantRole.ADMIN) {
            return buildRole(DefaultWorkspaceRole.ADMIN)
        }
        const membership = await workspaceMemberRepo().findOneBy({ workspaceId, userId })
        if (isNil(membership)) {
            return null
        }
        return buildRole(membership.role)
    },

    async isTenantAdmin({ userId }: { userId: string }): Promise<boolean> {
        const user = await userService(log).getOneOrFail({ id: userId })
        return user.tenantRole === TenantRole.ADMIN
    },
})

type AssertParams = {
    principal: Principal
    workspaceId: string | undefined | null
    permission?: Permission
}

type ResolveRoleParams = {
    userId: string
    workspaceId: string
}
