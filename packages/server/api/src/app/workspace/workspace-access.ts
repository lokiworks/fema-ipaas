import { apId, ApplicationError, ErrorCode, isNil, Permission, RoleType, WorkspaceRole } from '@fema/core-utils'
import { Principal, PrincipalType, TenantRole } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { userService } from '../user/user-service'
import { workspaceService } from './workspace-service'

const WORKSPACE_ADMIN_ROLE: WorkspaceRole = {
    id: apId(),
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Workspace Admin',
    permissions: Object.values(Permission),
    tenantId: null,
    type: RoleType.DEFAULT,
}

function denied(message: string): never {
    throw new ApplicationError({
        code: ErrorCode.AUTHORIZATION,
        params: { message },
    })
}

export const workspaceAccess = (log: FastifyBaseLogger) => ({
    async assertPrincipalCanAccessWorkspace({ principal, workspaceId }: AssertParams): Promise<void> {
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
    },

    async resolveRole({ userId, workspaceId }: ResolveRoleParams): Promise<WorkspaceRole | null> {
        const workspace = await workspaceService(log).getOne(workspaceId)
        if (isNil(workspace)) {
            return null
        }
        if (workspace.ownerId === userId) {
            return WORKSPACE_ADMIN_ROLE
        }
        const user = await userService(log).getOneOrFail({ id: userId })
        if (user.tenantId !== workspace.tenantId) {
            return null
        }
        return user.tenantRole === TenantRole.ADMIN ? WORKSPACE_ADMIN_ROLE : null
    },

    async isTenantAdmin({ userId }: { userId: string }): Promise<boolean> {
        const user = await userService(log).getOneOrFail({ id: userId })
        return user.tenantRole === TenantRole.ADMIN
    },
})

type AssertParams = {
    principal: Principal
    workspaceId: string | undefined | null
}

type ResolveRoleParams = {
    userId: string
    workspaceId: string
}
