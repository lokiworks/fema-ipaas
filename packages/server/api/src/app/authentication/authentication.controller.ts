import { isNil } from '@fema/core-utils'
import { ApplicationEventName, CompleteSignUpRequest, PrincipalType, RequestEmailCodeRequest, SignInRequest, SignUpRequest, SwitchTenantRequest, TelemetryEventName, UserIdentityProvider, VerifyEmailCodeRequest } from '@fema/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { authnRateLimit, emailCodeRateLimit } from '../core/security/rate-limit'
import { applicationEvents } from '../helper/application-events'
import { networkUtils } from '../helper/network-utils'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { telemetry } from '../helper/telemetry.utils'
import { tenantUtils } from '../tenant/tenant.utils'
import { userService } from '../user/user-service'
import { authenticationService } from './authentication.service'
import { turnstile } from './lib/turnstile'
import { passwordlessAuthService } from './passwordless-auth.service'

export const authenticationController: FastifyPluginAsyncZod = async (
    app,
) => {
    app.post('/sign-up', SignUpRequestOptions, async (request) => {

        const tenantId = await tenantUtils.getTenantIdForRequest(request)
        await turnstile.assertSolved({
            token: request.body.captchaToken,
            remoteIp: clientIp(request),
            log: request.log,
        })
        const signUpResponse = await authenticationService(request.log).signUp({
            ...request.body,
            provider: UserIdentityProvider.EMAIL,
            tenantId: tenantId ?? null,
        })

        if (!isNil(signUpResponse.tenantId)) {
            applicationEvents(request.log).sendUserEvent({
                tenantId: signUpResponse.tenantId,
                userId: signUpResponse.id,
                workspaceId: signUpResponse.workspaceId ?? undefined,
                ip: networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
            }, {
                action: ApplicationEventName.USER_SIGNED_UP,
                data: {
                    source: 'credentials',
                },
            })
        }

        return signUpResponse
    })

    app.post('/sign-in', SignInRequestOptions, async (request) => {

        const predefinedTenantId = await tenantUtils.getTenantIdForRequest(request)
        const response = await authenticationService(request.log).signInWithPassword({
            email: request.body.email,
            password: request.body.password,
            predefinedTenantId,
        })

        if (!isNil(response.tenantId)) {
            applicationEvents(request.log).sendUserEvent({
                tenantId: response.tenantId,
                userId: response.id,
                workspaceId: response.workspaceId ?? undefined,
                ip: networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
            }, {
                action: ApplicationEventName.USER_SIGNED_IN,
                data: {},
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

    app.post('/otp/request', RequestEmailCodeRequestOptions, async (request, reply) => {
        const tenantId = await tenantUtils.getTenantIdForRequest(request)
        await passwordlessAuthService(request.log).requestCode({
            email: request.body.email,
            tenantId: tenantId ?? null,
            captchaToken: request.body.captchaToken,
            remoteIp: clientIp(request),
        })
        return reply.code(StatusCodes.NO_CONTENT).send()
    })

    app.post('/otp/verify', VerifyEmailCodeRequestOptions, async (request) => {
        const tenantId = await tenantUtils.getTenantIdForRequest(request)
        const response = await passwordlessAuthService(request.log).verifyCode({
            email: request.body.email,
            code: request.body.code,
            tenantId: tenantId ?? null,
        })

        if (!isNil(response.tenantId)) {
            applicationEvents(request.log).sendUserEvent({
                tenantId: response.tenantId,
                userId: response.id,
                workspaceId: response.workspaceId ?? undefined,
                ip: networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
            }, {
                action: ApplicationEventName.USER_SIGNED_IN,
                data: {},
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

    app.post('/complete-sign-up', CompleteSignUpRequestOptions, async (request) => {
        const { response, signedUp } = await passwordlessAuthService(request.log).completeSignUp({
            identityId: request.principal.id,
            fullName: request.body.fullName,
        })

        if (signedUp && !isNil(response.tenantId)) {
            applicationEvents(request.log).sendUserEvent({
                tenantId: response.tenantId,
                userId: response.id,
                workspaceId: response.workspaceId ?? undefined,
                ip: networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)),
            }, {
                action: ApplicationEventName.USER_SIGNED_UP,
                data: {},
            })
        }

        return response
    })

    app.post('/switch-tenant', SwitchTenantRequestOptions, async (request) => {
        const user = await userService(request.log).getOneOrFail({ id: request.principal.id })
        return authenticationService(request.log).switchTenant({
            identityId: user.identityId,
            tenantId: request.body.tenantId,
        })
    })

}



const SwitchTenantRequestOptions = {
    config: {
        security: securityAccess.publicTenant([PrincipalType.USER]),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: SwitchTenantRequest,
    },
}

const SignUpRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: SignUpRequest,
    },
}

const CompleteSignUpRequestOptions = {
    config: {
        security: securityAccess.unscoped([PrincipalType.ONBOARDING]),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: CompleteSignUpRequest,
    },
}

const RequestEmailCodeRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: emailCodeRateLimit,
    },
    schema: {
        body: RequestEmailCodeRequest,
    },
}

function clientIp(request: FastifyRequest): string {
    return networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER))
}

const VerifyEmailCodeRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: VerifyEmailCodeRequest,
    },
}

const SignInRequestOptions = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: SignInRequest,
    },
}
