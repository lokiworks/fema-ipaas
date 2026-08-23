import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { Principal, PrincipalType, TenantRole, WorkspaceType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { userService } from '../../user/user-service'
import { workspaceService } from '../../workspace/workspace-service'

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

    async assertWorkspaceIsTeamType({ workspaceId, log }: WorkspaceParams): Promise<void> {
        if (isNil(workspaceId)) {
            return
        }
        const workspace = await workspaceService(log).getOne(workspaceId)
        if (isNil(workspace) || workspace.type !== WorkspaceType.TEAM) {
            throw new ApplicationError({
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
