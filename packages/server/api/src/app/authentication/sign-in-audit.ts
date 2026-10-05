import { ApplicationError, isNil, TenantId } from '@fema-ipaas/core-utils'
import { ApplicationEventName } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { applicationEvents } from '../helper/application-events'
import { networkUtils } from '../helper/network-utils'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

function recordFailure({ request, tenantId, email, method, error }: RecordFailureParams): void {
    if (isNil(tenantId) || !(error instanceof ApplicationError)) {
        return
    }
    applicationEvents(request.log).sendUserEvent({
        tenantId,
        ip: networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
    }, {
        action: ApplicationEventName.USER_SIGN_IN_FAILED,
        data: { target: email, detail: `${method}: ${error.error.code}` },
    })
}

export const signInAudit = {
    recordFailure,
}

type RecordFailureParams = {
    request: FastifyRequest
    tenantId: TenantId | null
    email: string
    method: 'password' | 'email code'
    error: unknown
}
