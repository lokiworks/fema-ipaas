import { isNil } from '@fema-ipaas/core-utils'
import { ApplicationEventName, RequestSmsCodeRequest, TelemetryEventName, VerifySmsCodeRequest } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { authnRateLimit, emailCodeRateLimit } from '../../core/security/rate-limit'
import { applicationEvents } from '../../helper/application-events'
import { networkUtils } from '../../helper/network-utils'
import { rejectedPromiseHandler } from '../../helper/promise-handler'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { telemetry } from '../../helper/telemetry.utils'
import { tenantUtils } from '../../tenant/tenant.utils'
import { signInAudit } from '../sign-in-audit'
import { smsAuthService } from './sms-auth.service'

export const smsAuthController: FastifyPluginAsyncZod = async (app) => {
    app.post('/request', RequestSmsCodeRequestOptions, async (request, reply) => {
        const tenantId = await tenantUtils.getTenantIdForRequest(request)
        await smsAuthService(request.log).requestLoginCode({
            phone: request.body.phone,
            tenantId,
            captchaToken: request.body.captchaToken,
            remoteIp: clientIp(request),
        })
        return reply.code(StatusCodes.NO_CONTENT).send()
    })

    app.post('/verify', VerifySmsCodeRequestOptions, async (request) => {
        const tenantId = await tenantUtils.getTenantIdForRequest(request)
        const response = await smsAuthService(request.log).verifyLoginCode({
            phone: request.body.phone,
            code: request.body.code,
            tenantId,
        }).catch((error: unknown) => {
            signInAudit.recordFailure({ request, tenantId, email: request.body.phone, method: 'sms code', error })
            throw error
        })

        if (!isNil(response.tenantId)) {
            applicationEvents(request.log).sendUserEvent({
                tenantId: response.tenantId,
                userId: response.id,
                projectId: response.projectId ?? undefined,
                ip: clientIp(request),
            }, {
                action: ApplicationEventName.USER_SIGNED_IN,
                data: { method: 'sms' },
            })
            rejectedPromiseHandler(telemetry(request.log).trackUser(response.id, {
                name: TelemetryEventName.SIGNED_IN,
                payload: {
                    userId: response.id,
                    tenantId: response.tenantId,
                },
            }, { tenant: response.tenantId }), request.log)
        }
        return response
    })
}

function clientIp(request: FastifyRequest): string {
    return networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER))
}

const RequestSmsCodeRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: emailCodeRateLimit,
    },
    schema: {
        body: RequestSmsCodeRequest,
    },
}

const VerifySmsCodeRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: VerifySmsCodeRequest,
    },
}
