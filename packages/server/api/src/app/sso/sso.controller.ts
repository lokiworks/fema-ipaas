import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import {
    ApplicationEventName,
    AuthenticationResponse,
    SsoCallbackQuery,
    SsoExchangeRequestBody,
    SsoLoginErrorCode,
    SsoPublicProvidersResponse,
    SsoStartQuery,
} from '@fema-ipaas/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { authnRateLimit } from '../core/security/rate-limit'
import { applicationEvents } from '../helper/application-events'
import { domainHelper } from '../helper/domain-helper'
import { networkUtils } from '../helper/network-utils'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { tenantUtils } from '../tenant/tenant.utils'
import { ssoConfigService } from './sso-config.service'
import { isSsoLoginError } from './sso-errors'
import { ssoLoginService } from './sso-login.service'
import { ssoState } from './sso-state'

export const ssoController: FastifyPluginAsyncZod = async (app) => {
    app.get('/providers', ProvidersRequest, async (request): Promise<SsoPublicProvidersResponse> => {
        const tenantId = await tenantUtils.getTenantIdForRequest(request)
        if (isNil(tenantId)) {
            return { providers: [] }
        }
        return { providers: await ssoConfigService(request.log).listPublicProviders({ tenantId }) }
    })

    app.get('/start', StartRequest, async (request, reply) => {
        const tenantId = await tenantUtils.getTenantIdForRequest(request)
        if (isNil(tenantId)) {
            return redirectToSignIn({ reply, code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED })
        }
        try {
            const started = await ssoLoginService(request.log).start({ tenantId, provider: request.query.provider, mode: 'login', actorUserId: null })
            return await reply.header('set-cookie', ssoState.buildBindingCookie({ binding: started.binding })).redirect(started.redirectUrl)
        }
        catch (error) {
            return redirectToSignIn({ reply, code: errorCodeOf(error) })
        }
    })

    app.get('/callback', CallbackRequest, async (request, reply) => {
        const outcome = await ssoLoginService(request.log).handleCallback({
            query: request.query,
            binding: ssoState.readBinding({ request }),
            ip: clientIp(request),
        })
        const cleared = ssoState.buildClearedBindingCookie()
        if (outcome.ok && outcome.kind === 'login') {
            const target = await domainHelper.getPublicUrl({ path: `/sso/complete?ticket=${encodeURIComponent(outcome.ticket)}` })
            return reply.header('set-cookie', cleared).redirect(target)
        }
        if (outcome.ok) {
            const target = await domainHelper.getPublicUrl({ path: `/tenant/security/authentication?ssoTest=ok&provider=${outcome.provider}` })
            return reply.header('set-cookie', cleared).redirect(target)
        }
        const tenantId = outcome.tenantId ?? await tenantUtils.getTenantIdForRequest(request)
        if (!isNil(tenantId)) {
            applicationEvents(request.log).sendUserEvent({ tenantId, ip: clientIp(request) }, {
                action: ApplicationEventName.USER_SIGN_IN_FAILED,
                data: {
                    target: outcome.email ?? '',
                    detail: `${outcome.mode === 'test' ? 'test ' : ''}${outcome.provider ?? 'SSO'}: ${outcome.code} - ${outcome.detail}`,
                },
            })
        }
        request.log.warn({ code: outcome.code, detail: outcome.detail, provider: outcome.provider }, '[sso] sign-in rejected')
        const path = outcome.mode === 'test'
            ? `/tenant/security/authentication?ssoTest=${outcome.code}&provider=${outcome.provider ?? ''}`
            : `/sign-in?ssoError=${outcome.code}`
        const target = await domainHelper.getPublicUrl({ path })
        return reply.header('set-cookie', cleared).redirect(target)
    })

    app.post('/exchange', ExchangeRequest, async (request): Promise<AuthenticationResponse> => {
        try {
            const response = await ssoLoginService(request.log).redeemTicket({ ticket: request.body.ticket })
            if (!isNil(response.tenantId)) {
                applicationEvents(request.log).sendUserEvent({ tenantId: response.tenantId, userId: response.id, projectId: response.projectId ?? undefined, ip: clientIp(request) }, {
                    action: ApplicationEventName.USER_SIGNED_IN,
                    data: { method: 'sso' },
                })
            }
            return response
        }
        catch (error) {
            if (isSsoLoginError(error)) {
                throw new ApplicationError({ code: ErrorCode.AUTHENTICATION, params: { message: error.detail } })
            }
            throw error
        }
    })
}

function redirectToSignIn({ reply, code }: { reply: FastifyReply, code: SsoLoginErrorCode }): Promise<FastifyReply> {
    return domainHelper.getPublicUrl({ path: `/sign-in?ssoError=${code}` }).then((target) => reply.redirect(target))
}

function errorCodeOf(error: unknown): SsoLoginErrorCode {
    return isSsoLoginError(error) ? error.code : SsoLoginErrorCode.UNKNOWN
}

function clientIp(request: FastifyRequest): string {
    return networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER))
}

const ProvidersRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        tags: ['sso'],
        response: { [StatusCodes.OK]: SsoPublicProvidersResponse },
    },
}

const StartRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        tags: ['sso'],
        querystring: SsoStartQuery,
    },
}

const CallbackRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        tags: ['sso'],
        querystring: SsoCallbackQuery,
    },
}

const ExchangeRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        tags: ['sso'],
        body: SsoExchangeRequestBody,
        response: { [StatusCodes.OK]: AuthenticationResponse },
    },
}
