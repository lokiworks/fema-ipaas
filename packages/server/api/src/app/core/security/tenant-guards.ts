import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { Principal, PrincipalType, ProjectType, TenantRole } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'

export const tenantGuards = {
    async assertPrincipalIsTenantAdmin({ principal, log }: PrincipalParams): Promise<void> {
        if (principal.type === PrincipalType.SERVICE) {
            return
        }
        const user = await userService(log).getOneOrFail({ id: principal.id })
        const tenantId = 'tenant' in principal ? principal.tenant.id : undefined
        if (isNil(tenantId) || user.tenantId !== tenantId || user.tenantRole !== TenantRole.ADMIN) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'User is not an admin of the tenant' },
            })
        }
    },

    async assertProjectIsTeamType({ projectId, log }: ProjectParams): Promise<void> {
        if (isNil(projectId)) {
            return
        }
        const project = await projectService(log).getOne(projectId)
        if (isNil(project) || project.type !== ProjectType.TEAM) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'Operation is only allowed on team projects' },
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
