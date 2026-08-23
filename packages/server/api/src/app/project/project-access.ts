import { ActivepiecesError, apId, ErrorCode, isNil, Permission, ProjectRole, RoleType } from '@activepieces/core-utils'
import { Principal, PlatformRole, PrincipalType } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { userService } from '../user/user-service'
import { projectService } from './project-service'

const WORKSPACE_ADMIN_ROLE: ProjectRole = {
    id: apId(),
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    name: 'Workspace Admin',
    permissions: Object.values(Permission),
    platformId: null,
    type: RoleType.DEFAULT,
}

function denied(message: string): never {
    throw new ActivepiecesError({
        code: ErrorCode.AUTHORIZATION,
        params: { message },
    })
}

export const projectAccess = (log: FastifyBaseLogger) => ({
    async assertPrincipalCanAccessProject({ principal, projectId }: AssertParams): Promise<void> {
        if (isNil(projectId)) {
            denied('Project ID is required')
        }
        const project = await projectService(log).getOne(projectId)
        if (isNil(project) || project.platformId !== principal.platform.id) {
            denied('User not allowed to access this project')
        }
        if (principal.type !== PrincipalType.USER) {
            return
        }
        const role = await this.resolveRole({ userId: principal.id, projectId })
        if (isNil(role)) {
            denied('User not allowed to access this project')
        }
    },

    async resolveRole({ userId, projectId }: ResolveRoleParams): Promise<ProjectRole | null> {
        const project = await projectService(log).getOne(projectId)
        if (isNil(project)) {
            return null
        }
        if (project.ownerId === userId) {
            return WORKSPACE_ADMIN_ROLE
        }
        const user = await userService(log).getOneOrFail({ id: userId })
        if (user.platformId !== project.platformId) {
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
    projectId: string | undefined | null
}

type ResolveRoleParams = {
    userId: string
    projectId: string
}
