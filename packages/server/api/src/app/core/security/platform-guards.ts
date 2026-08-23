import { ErrorCode, isNil, PlatformError } from '@fema/core-utils'
import { PlatformRole, Principal, PrincipalType, WorkspaceType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { userService } from '../../user/user-service'
import { workspaceService } from '../../workspace/workspace-service'

export const platformGuards = {
    async assertPrincipalIsPlatformAdmin({ principal, log }: PrincipalParams): Promise<void> {
        if (principal.type === PrincipalType.SERVICE) {
            return
        }
        const user = await userService(log).getOneOrFail({ id: principal.id })
        const platformId = 'platform' in principal ? principal.platform.id : undefined
        if (isNil(platformId) || user.platformId !== platformId || user.platformRole !== PlatformRole.ADMIN) {
            throw new PlatformError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'User is not an admin of the platform' },
            })
        }
    },

    async assertWorkspaceIsTeamType({ workspaceId, log }: WorkspaceParams): Promise<void> {
        if (isNil(workspaceId)) {
            return
        }
        const workspace = await workspaceService(log).getOne(workspaceId)
        if (isNil(workspace) || workspace.type !== WorkspaceType.TEAM) {
            throw new PlatformError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Operation is only allowed on team workspaces' },
            })
        }
    },
}

type PrincipalParams = {
    principal: Principal
    log: FastifyBaseLogger
}

type WorkspaceParams = {
    workspaceId: string | undefined | null
    log: FastifyBaseLogger
}
