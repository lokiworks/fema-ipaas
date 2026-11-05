import { AccountSecurityStatus, ConfirmPhoneBindingRequest, PrincipalType, RequestPhoneBindingRequest } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { mfaService } from '../authentication/mfa/mfa.service'
import { smsAuthService } from '../authentication/sms/sms-auth.service'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { authnRateLimit, emailCodeRateLimit } from '../core/security/rate-limit'
import { networkUtils } from '../helper/network-utils'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { accountSecurityService } from './account-security.service'

export const accountSecurityController: FastifyPluginAsyncZod = async (app) => {
    app.get('/security', SecurityStatusRequest, async (request): Promise<AccountSecurityStatus> => {
        const identityId = await accountSecurityService(request.log).identityIdOf({ userId: request.principal.id })
        return accountSecurityService(request.log).getStatus({ identityId, tenantId: request.principal.tenant.id })
    })

    app.post('/phone/request', RequestPhoneBindingRequestOptions, async (request, reply) => {
        const identityId = await accountSecurityService(request.log).identityIdOf({ userId: request.principal.id })
        await smsAuthService(request.log).requestBindingCode({
            identityId,
            phone: request.body.phone,
            captchaToken: request.body.captchaToken,
            remoteIp: clientIp(request),
        })
        return reply.code(StatusCodes.NO_CONTENT).send()
    })

    app.post('/phone/confirm', ConfirmPhoneBindingRequestOptions, async (request): Promise<AccountSecurityStatus> => {
        const identityId = await accountSecurityService(request.log).identityIdOf({ userId: request.principal.id })
        const identity = await smsAuthService(request.log).confirmBinding({
            identityId,
            phone: request.body.phone,
            code: request.body.code,
        })
        return accountSecurityService(request.log).statusOf({ identity, tenantId: request.principal.tenant.id })
    })

    app.post('/mfa/recovery-codes', RegenerateRecoveryCodesRequest, async (request) => {
        const identityId = await accountSecurityService(request.log).identityIdOf({ userId: request.principal.id })
        const identity = await userIdentityService(request.log).getOneOrFail({ id: identityId })
        const recoveryCodes = await mfaService(request.log).regenerateRecoveryCodes({ identityId: identity.id })
        return { recoveryCodes }
    })
}

function clientIp(request: FastifyRequest): string {
    return networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER))
}

const userOnly = securityAccess.publicTenant([PrincipalType.USER])

const SecurityStatusRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['account'],
        response: { [StatusCodes.OK]: AccountSecurityStatus },
    },
}

const RequestPhoneBindingRequestOptions = {
    config: { security: userOnly, rateLimit: emailCodeRateLimit },
    schema: { tags: ['account'], body: RequestPhoneBindingRequest },
}

const ConfirmPhoneBindingRequestOptions = {
    config: { security: userOnly, rateLimit: authnRateLimit },
    schema: {
        tags: ['account'],
        body: ConfirmPhoneBindingRequest,
        response: { [StatusCodes.OK]: AccountSecurityStatus },
    },
}

const RegenerateRecoveryCodesRequest = {
    config: { security: userOnly, rateLimit: authnRateLimit },
    schema: {
        tags: ['account'],
        response: { [StatusCodes.OK]: z.object({ recoveryCodes: z.array(z.string()) }) },
    },
}
