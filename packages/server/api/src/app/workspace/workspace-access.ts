import { apId, ErrorCode, isNil, Permission, PlatformError, RoleType, WorkspaceRole } from '@fema/core-utils'
import { PlatformRole, Principal, PrincipalType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { userService } from '../user/user-service'
import { workspaceService } from './workspace-service'

const WORKSPACE_ADMIN_ROLE: WorkspaceRole = {
    id: apId(),
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Workspace Admin',
    permissions: Object.values(Permission),
    platformId: null,
    type: RoleType.DEFAULT,
}

function denied(message: string): never {
    throw new PlatformError({
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
        const platformId = 'platform' in principal ? principal.platform.id : undefined
        if (isNil(workspace) || isNil(platformId) || workspace.platformId !== platformId) {
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
        if (user.platformId !== workspace.platformId) {
            return null
        }
        return user.platformRole === PlatformRole.ADMIN ? WORKSPACE_ADMIN_ROLE : null
    },

    async isPlatformAdmin({ userId }: { userId: string }): Promise<boolean> {
        const user = await userService(log).getOneOrFail({ id: userId })
        return user.platformRole === PlatformRole.ADMIN
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
