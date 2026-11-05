import { ApplicationError, ErrorCode, isNil, TenantId } from '@fema-ipaas/core-utils'
import { ApplicationEventName } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { applicationEvents } from '../helper/application-events'
import { networkUtils } from '../helper/network-utils'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

function isFollowUpStep(error: unknown): boolean {
    return error instanceof ApplicationError && FOLLOW_UP_CODES.includes(error.error.code)
}

function recordFailure({ request, tenantId, email, method, error }: RecordFailureParams): void {
    if (isNil(tenantId) || !(error instanceof ApplicationError) || isFollowUpStep(error)) {
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

const FOLLOW_UP_CODES: ErrorCode[] = [ErrorCode.MFA_REQUIRED, ErrorCode.MFA_ENROLLMENT_REQUIRED, ErrorCode.TENANT_SELECTION_REQUIRED]

export const signInAudit = {
    recordFailure,
    isFollowUpStep,
}

type RecordFailureParams = {
    request: FastifyRequest
    tenantId: TenantId | null
    email: string
    method: 'password' | 'email code' | 'sms code'
    error: unknown
}
