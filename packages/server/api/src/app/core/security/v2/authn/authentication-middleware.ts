import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { Principal, PrincipalType } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { lastActiveTracker } from '../../../../user/last-active-tracker'
import { userService } from '../../../../user/user-service'
import { RouteKind } from '../../authorization/common'
import { authenticateOrThrow } from './authenticate'

export const authenticationMiddleware = async (request: FastifyRequest): Promise<void> => {
    const security = request.routeOptions.config?.security
    // Todo(@chaker): remove this once we remove v1 authn
    if (isNil(security)) {
        return
    }
    if (security.kind === RouteKind.PUBLIC) {
        return
    }

    const principal = await authenticateOrThrow(request.log, request.headers['authorization'] ?? null)
    request.principal = principal
    recordLastActive({ principal, log: request.log })
}

function recordLastActive({ principal, log }: RecordLastActiveParams): void {
    if (principal.type !== PrincipalType.USER) {
        return
    }
    if (!lastActiveTracker.shouldWrite({ userId: principal.id, now: Date.now() })) {
        return
    }
    void tryCatch(() => userService(log).updateLastActiveDate({ id: principal.id, tenantId: principal.tenant.id })).then(({ error }) => {
        if (!isNil(error)) {
            log.warn({ err: error }, 'Failed to record the last active time of a user')
        }
    })
}

type RecordLastActiveParams = {
    principal: Principal
    log: FastifyBaseLogger
}
