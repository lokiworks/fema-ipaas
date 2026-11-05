import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import {
    ApplicationEventName,
    AuthenticationResponse,
    SsoCallbackQuery,
    SsoExchangeRequestBody,
    SsoLoginErrorCode,
    SsoPublicProvidersResponse,
    SsoScope,
    SsoStartQuery,
} from '@fema-ipaas/shared'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
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
        const tenantProviders = isNil(tenantId) ? [] : await ssoConfigService(request.log).listPublicProviders({ tenantId })
        const platformProviders = await ssoConfigService(request.log).listPlatformProviders()
        return { providers: [...tenantProviders, ...platformProviders] }
    })

    app.get('/start', StartRequest, async (request, reply) => {
        const scope = request.query.scope ?? SsoScope.TENANT
        const tenantId = scope === SsoScope.PLATFORM ? null : await resolveTenantIdOrNull(request)
        if (scope === SsoScope.TENANT && isNil(tenantId)) {
            return redirectToSignIn({ reply, code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED })
        }
        try {
            const started = await ssoLoginService(request.log).start({ tenantId, scope, provider: request.query.provider, mode: 'login', actorUserId: null })
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
        if (outcome.ok && outcome.kind === 'bind') {
            const target = await domainHelper.getPublicUrl({ path: `/tenant/security/authentication?ssoBind=ok&provider=${outcome.provider}` })
            return reply.header('set-cookie', cleared).redirect(target)
        }
        if (outcome.ok) {
            const target = await domainHelper.getPublicUrl({ path: `/tenant/security/authentication?ssoTest=ok&provider=${outcome.provider}` })
            return reply.header('set-cookie', cleared).redirect(target)
        }
        const tenantId = outcome.tenantId ?? await resolveTenantIdOrNull(request)
        if (!isNil(tenantId)) {
            applicationEvents(request.log).sendUserEvent({ tenantId, ip: clientIp(request) }, {
                action: ApplicationEventName.USER_SIGN_IN_FAILED,
                data: {
                    target: outcome.email ?? '',
                    detail: `${outcome.mode === 'login' ? '' : `${outcome.mode} `}${outcome.provider ?? 'SSO'}: ${outcome.code} - ${outcome.detail}`,
                },
            })
        }
        request.log.warn({ code: outcome.code, detail: outcome.detail, provider: outcome.provider }, '[sso] sign-in rejected')
        const target = await domainHelper.getPublicUrl({ path: failurePath({ outcome }) })
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

    app.get('/saml/metadata/:tenantId', SamlMetadataRequest, async (request, reply) => {
        try {
            const xml = await ssoLoginService(request.log).serviceProviderMetadata({ tenantId: request.params.tenantId })
            return await reply.type('application/samlmetadata+xml; charset=utf-8').send(xml)
        }
        catch (error) {
            if (isSsoLoginError(error)) {
                throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'saml_configuration', entityId: request.params.tenantId } })
            }
            throw error
        }
    })

    app.post('/saml/acs', SamlAcsRequest, async (request, reply) => {
        try {
            const state = await ssoLoginService(request.log).handleSamlAcs({ samlResponse: request.body.SAMLResponse, relayState: request.body.RelayState })
            const target = await domainHelper.getPublicApiUrl({ path: `/v1/authn/sso/callback?state=${encodeURIComponent(state)}&code=${SAML_CALLBACK_CODE}` })
            return await reply.redirect(target, StatusCodes.SEE_OTHER)
        }
        catch (error) {
            return redirectToSignIn({ reply, code: errorCodeOf(error) })
        }
    })
}

async function resolveTenantIdOrNull(request: FastifyRequest): Promise<string | null> {
    try {
        return await tenantUtils.getTenantIdForRequest(request)
    }
    catch (error) {
        if (error instanceof ApplicationError && error.error.code === ErrorCode.ENTITY_NOT_FOUND) {
            return null
        }
        throw error
    }
}

function failurePath({ outcome }: { outcome: FailedOutcome }): string {
    if (outcome.mode === 'test') {
        return `/tenant/security/authentication?ssoTest=${outcome.code}&provider=${outcome.provider ?? ''}`
    }
    if (outcome.mode === 'bind') {
        return `/tenant/security/authentication?ssoBind=${outcome.code}&provider=${outcome.provider ?? ''}`
    }
    return `/sign-in?ssoError=${outcome.code}`
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

const SAML_CALLBACK_CODE = 'saml'

const ProvidersQuery = z.object({
    tenant: z.string().max(200).optional(),
})

const SamlMetadataParams = z.object({
    tenantId: z.string().min(1).max(21),
})

const SamlAcsBody = z.object({
    SAMLResponse: z.string().min(1).max(500000),
    RelayState: z.string().max(500).optional(),
})

const ProvidersRequest = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        tags: ['sso'],
        querystring: ProvidersQuery,
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

const SamlMetadataRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        tags: ['sso'],
        params: SamlMetadataParams,
    },
}

const SamlAcsRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        tags: ['sso'],
        body: SamlAcsBody,
    },
}

type FailedOutcome = {
    code: SsoLoginErrorCode
    mode: 'login' | 'test' | 'bind'
    provider: string | null
}
