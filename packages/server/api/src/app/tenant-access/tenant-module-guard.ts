import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { Principal, PrincipalType, TenantModule } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { userRepo } from '../user/user-service'
import { tenantAccessUtils } from './tenant-access.utils'

export const tenantModuleGuard = {
    async hasModule({ principal, module }: HasModuleParams): Promise<boolean> {
        if (principal.type === PrincipalType.SERVICE) {
            return true
        }
        if (principal.type !== PrincipalType.USER) {
            return false
        }
        const user = await userRepo().findOneBy({ id: principal.id, tenantId: principal.tenant.id })
        if (isNil(user)) {
            return false
        }
        return tenantAccessUtils.hasModule({ tenantRole: user.tenantRole, storedModules: user.modules ?? [], module })
    },
    async assertHasModule({ principal, module, log }: AssertHasModuleParams): Promise<void> {
        const allowed = await tenantModuleGuard.hasModule({ principal, module })
        if (allowed) {
            return
        }
        log.info({ user: { id: principal.id }, module }, '[tenantModuleGuard] module access denied')
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: `The ${module} module is not enabled for this user`,
            },
        })
    },
    requireModule(module: TenantModule): (request: FastifyRequest) => Promise<void> {
        return async (request) => {
            await tenantModuleGuard.assertHasModule({ principal: request.principal, module, log: request.log })
        }
    },
}

type HasModuleParams = {
    principal: Principal
    module: TenantModule
}

type AssertHasModuleParams = HasModuleParams & {
    log: FastifyBaseLogger
}
