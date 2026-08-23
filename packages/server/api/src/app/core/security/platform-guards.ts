import { ActivepiecesError, ErrorCode, isNil } from '@fema/core-utils'
import { PlatformRole, Principal, PrincipalType, ProjectType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'

export const platformGuards = {
    async assertPrincipalIsPlatformAdmin({ principal, log }: PrincipalParams): Promise<void> {
        if (principal.type === PrincipalType.SERVICE) {
            return
        }
        const user = await userService(log).getOneOrFail({ id: principal.id })
        const platformId = 'platform' in principal ? principal.platform.id : undefined
        if (isNil(platformId) || user.platformId !== platformId || user.platformRole !== PlatformRole.ADMIN) {
            throw new ActivepiecesError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'User is not an admin of the platform' },
            })
        }
    },

    async assertProjectIsTeamType({ projectId, log }: ProjectParams): Promise<void> {
        if (isNil(projectId)) {
            return
        }
        const project = await projectService(log).getOne(projectId)
        if (isNil(project) || project.type !== ProjectType.TEAM) {
            throw new ActivepiecesError({
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

type ProjectParams = {
    projectId: string | undefined | null
    log: FastifyBaseLogger
}
