import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import {
    AuthenticationResponse,
    FEDERATION_LIMITS,
    PrincipalType,
    SsoLoginErrorCode,
    SsoProvider,
    SsoScope,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { authenticationUtils } from '../authentication/authentication-utils'
import { accessTokenManager } from '../authentication/lib/access-token-manager'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { ExternalIdentityRecord, externalIdentityService } from '../federation/external-identity.service'
import { identityContact } from '../helper/identity-contact'
import { userService } from '../user/user-service'
import { samlClient } from './saml-client'
import { ssoConfigService } from './sso-config.service'
import { SsoLoginError } from './sso-errors'
import { ssoPlatformLogin } from './sso-platform-login'
import { ssoProfile, SsoProfile } from './sso-profile'
import { RuntimePolicy, ssoRuntime } from './sso-runtime'
import { SsoMode, ssoState, SsoStateRecord } from './sso-state'
import { ssoUserResolver } from './sso-user-resolver'

export const ssoLoginService = (log: FastifyBaseLogger) => ({
    async start({ tenantId, scope, provider, mode, actorUserId }: StartParams): Promise<StartResult> {
        const redirectUri = await ssoConfigService(log).redirectUri()
        if (scope === SsoScope.PLATFORM) {
            const runtime = await ssoRuntime.loadPlatformRuntime({ provider })
            if (isNil(runtime)) {
                throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is not configured' })
            }
            const begun = await ssoState.begin({ tenantId: mode === 'bind' ? tenantId : null, scope, provider, mode, actorUserId })
            return { redirectUrl: ssoRuntime.buildPlatformAuthorizationUrl({ runtime, redirectUri, begun }), binding: begun.binding }
        }
        if (isNil(tenantId)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'The tenant to sign in to could not be determined' })
        }
        const runtime = await ssoRuntime.loadTenantRuntime({ log, tenantId, provider })
        if (isNil(runtime)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is not configured' })
        }
        if (mode === 'login' && !runtime.enabled) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is turned off' })
        }
        const begun = await ssoState.begin({ tenantId, scope, provider, mode, actorUserId })
        return { redirectUrl: await ssoRuntime.buildTenantAuthorizationUrl({ runtime, redirectUri, begun }), binding: begun.binding }
    },

    async handleSamlAcs({ samlResponse, relayState }: SamlAcsParams): Promise<string> {
        const record = await ssoState.peek({ state: relayState })
        if (record.provider !== SsoProvider.SAML || isNil(record.tenantId) || isNil(record.samlRequestId) || isNil(relayState)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.STATE_INVALID, detail: 'The state does not belong to a SAML sign-in' })
        }
        try {
            const stored = await ssoConfigService(log).getStoredSaml({ tenantId: record.tenantId })
            if (isNil(stored)) {
                throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is not configured' })
            }
            const sp = await ssoConfigService(log).serviceProviderUrls({ tenantId: record.tenantId })
            const assertion = await samlClient.validateResponse({ stored, sp, samlResponse, expectedRequestId: record.samlRequestId })
            await ssoState.storeSamlResult({ state: relayState, result: { ok: true, nameId: assertion.nameId, attributes: assertion.attributes } })
        }
        catch (error) {
            const failure = error instanceof SsoLoginError ? error : new SsoLoginError({ code: SsoLoginErrorCode.UNKNOWN, detail: error instanceof Error ? error.message : 'unexpected error' })
            await ssoState.storeSamlResult({ state: relayState, result: { ok: false, code: failure.code, detail: failure.detail } })
        }
        return relayState
    },

    async serviceProviderMetadata({ tenantId }: { tenantId: string }): Promise<string> {
        const stored = await ssoConfigService(log).getStoredSaml({ tenantId })
        if (isNil(stored)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is not configured' })
        }
        const sp = await ssoConfigService(log).serviceProviderUrls({ tenantId })
        return samlClient.buildServiceProviderMetadata({ stored, sp })
    },

    async handleCallback({ query, binding, ip }: CallbackParams): Promise<CallbackOutcome> {
        let record: SsoStateRecord
        try {
            record = await ssoState.consume({ state: query.state, binding })
        }
        catch (error) {
            return failureFrom({ error, record: null, email: null })
        }
        let email: string | null = null
        try {
            if (!isNil(query.error)) {
                throw new SsoLoginError({ code: SsoLoginErrorCode.IDP_DENIED, detail: `The identity provider answered ${query.error}${isNil(query.error_description) ? '' : ` (${query.error_description})` }` })
            }
            const code = query.code ?? query.authCode ?? query.auth_code
            if (isNil(code) || code.length === 0) {
                throw new SsoLoginError({ code: SsoLoginErrorCode.CODE_REJECTED, detail: 'The callback carries no authorization code' })
            }
            const redirectUri = await ssoConfigService(log).redirectUri()
            if (record.scope === SsoScope.PLATFORM) {
                return await handlePlatformCallback({
                    log,
                    record,
                    code,
                    redirectUri,
                    ip,
                    onEmail: (value) => {
                        email = value
                    },
                })
            }
            return await handleTenantCallback({
                log,
                record,
                code,
                state: query.state,
                redirectUri,
                ip,
                onEmail: (value) => {
                    email = value
                },
            })
        }
        catch (error) {
            return failureFrom({ error, record, email })
        }
    },

    async redeemTicket({ ticket }: { ticket: string }): Promise<AuthenticationResponse> {
        const redeemed = await ssoState.redeemTicket({ ticket })
        const response = await authenticationUtils(log).getProjectAndToken({
            userId: redeemed.userId,
            tenantId: redeemed.tenantId,
            projectId: null,
        })
        if (isNil(redeemed.sessionSeconds)) {
            return response
        }
        const user = await userService(log).getOneOrFail({ id: redeemed.userId })
        const identity = await userIdentityService(log).getOneOrFail({ id: user.identityId })
        const token = await accessTokenManager(log).generateToken({
            id: user.id,
            type: PrincipalType.USER,
            tenant: { id: redeemed.tenantId },
            tokenVersion: identity.tokenVersion,
        }, redeemed.sessionSeconds)
        return { ...response, token }
    },
})

async function handleTenantCallback({ log, record, code, state, redirectUri, ip, onEmail }: TenantCallbackParams): Promise<CallbackOutcome> {
    const tenantId = record.tenantId
    if (isNil(tenantId)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.STATE_INVALID, detail: 'The sign-in state carries no tenant' })
    }
    const runtime = await ssoRuntime.loadTenantRuntime({ log, tenantId, provider: record.provider })
    if (isNil(runtime) || (record.mode === 'login' && !runtime.enabled)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is not available' })
    }
    const fetched = await ssoRuntime.fetchTenantProfile({ log, runtime, record, code, state, redirectUri })
    const profile = fetched.profile
    onEmail(profile.email)
    const policy = ssoRuntime.policyOf({ runtime })
    const binding = await externalIdentityService(log).findBinding({ issuer: policy.issuer, subject: profile.subject })
    await ssoUserResolver.assertProfileAllowed({ log, policy, profile, tenantId, binding })
    if (record.mode === 'test') {
        await completeTest({ log, record, profile, binding })
        return { ok: true, kind: 'test', provider: record.provider, tenantId }
    }
    const resolved = await ssoUserResolver.resolve({ log, policy, profile, tenantId, binding, ip })
    await storeRefreshToken({ log, policy, tenantId, externalIdentityId: resolved.externalIdentityId, refreshToken: fetched.refreshToken })
    await ssoConfigService(log).markLoggedIn({ tenantId, provider: record.provider })
    const ticket = await ssoState.issueTicket({ userId: resolved.userId, tenantId, sessionSeconds: sessionSecondsFor({ policy }) })
    return { ok: true, kind: 'login', provider: record.provider, tenantId, ticket }
}

async function handlePlatformCallback({ log, record, code, redirectUri, ip, onEmail }: PlatformCallbackParams): Promise<CallbackOutcome> {
    const runtime = await ssoRuntime.loadPlatformRuntime({ provider: record.provider })
    if (isNil(runtime)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is not available' })
    }
    const platform = await ssoRuntime.fetchPlatformProfile({ runtime, record, code, redirectUri })
    onEmail(platform.profile.email)
    if (record.mode === 'bind') {
        const tenantId = record.tenantId
        if (isNil(tenantId)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.STATE_INVALID, detail: 'The sign-in state carries no tenant' })
        }
        await ssoPlatformLogin.bind({ log, kind: runtime.kind, platform, tenantId, actorUserId: record.actorUserId })
        return { ok: true, kind: 'bind', provider: record.provider, tenantId }
    }
    const result = await ssoPlatformLogin.login({ log, kind: runtime.kind, platform, app: runtime.app, ip })
    const ticket = await ssoState.issueTicket({ userId: result.userId, tenantId: result.tenantId })
    return { ok: true, kind: 'login', provider: record.provider, tenantId: result.tenantId, ticket }
}

async function completeTest({ log, record, profile, binding }: CompleteTestParams): Promise<void> {
    const actor = isNil(record.actorUserId) ? null : await userService(log).get({ id: record.actorUserId })
    const actorIdentity = isNil(actor) ? null : await userIdentityService(log).getOneOrFail({ id: actor.identityId })
    const actorEmail = identityContact.emailOrNull(actorIdentity)?.toLowerCase() ?? null
    const matchesBinding = !isNil(actor) && !isNil(binding) && binding.userId === actor.id
    const matchesEmail = ssoProfile.hasEmail(profile) && !isNil(actorEmail) && actorEmail === profile.email
    if (!matchesBinding && !matchesEmail) {
        throw new SsoLoginError({
            code: SsoLoginErrorCode.TEST_ACCOUNT_MISMATCH,
            detail: `The test sign-in returned ${ssoUserResolver.displayNameOf({ profile })}, which is not the account of the administrator running the test`,
        })
    }
    if (isNil(record.tenantId)) {
        return
    }
    await ssoConfigService(log).markVerified({ tenantId: record.tenantId, provider: record.provider })
}

async function storeRefreshToken({ log, policy, tenantId, externalIdentityId, refreshToken }: StoreRefreshTokenParams): Promise<void> {
    if (!policy.federated || isNil(refreshToken)) {
        return
    }
    await externalIdentityService(log).saveRefreshToken({ id: externalIdentityId, tenantId, refreshToken })
}

function sessionSecondsFor({ policy }: { policy: RuntimePolicy }): number | undefined {
    return policy.federated ? FEDERATION_LIMITS.federatedSessionHours * SECONDS_PER_HOUR : undefined
}

function failureFrom({ error, record, email }: FailureParams): CallbackOutcome {
    const mode: SsoMode = record?.mode ?? 'login'
    const base = { tenantId: record?.tenantId ?? null, provider: record?.provider ?? null, mode, email }
    if (error instanceof SsoLoginError) {
        return { ok: false, code: error.code, detail: error.detail, ...base }
    }
    if (error instanceof ApplicationError && error.error.code === ErrorCode.USER_IS_INACTIVE) {
        return { ok: false, code: SsoLoginErrorCode.USER_DISABLED, detail: 'The account has been disabled', ...base }
    }
    const detail = error instanceof Error ? error.message : 'unexpected error'
    return { ok: false, code: SsoLoginErrorCode.UNKNOWN, detail, ...base }
}

const SECONDS_PER_HOUR = 3600

export type CallbackOutcome =
    | { ok: true, kind: 'login', provider: SsoProvider, tenantId: string, ticket: string }
    | { ok: true, kind: 'test', provider: SsoProvider, tenantId: string }
    | { ok: true, kind: 'bind', provider: SsoProvider, tenantId: string }
    | { ok: false, code: SsoLoginErrorCode, detail: string, tenantId: string | null, provider: SsoProvider | null, mode: SsoMode, email: string | null }

type StartParams = {
    tenantId: string | null
    scope: SsoScope
    provider: SsoProvider
    mode: SsoMode
    actorUserId: string | null
}

type StartResult = {
    redirectUrl: string
    binding: string
}

type SamlAcsParams = {
    samlResponse: string
    relayState: string | undefined
}

type CallbackParams = {
    query: {
        code?: string
        authCode?: string
        auth_code?: string
        state?: string
        error?: string
        error_description?: string
    }
    binding: string | null
    ip: string | undefined
}

type TenantCallbackParams = {
    log: FastifyBaseLogger
    record: SsoStateRecord
    code: string
    state: string | undefined
    redirectUri: string
    ip: string | undefined
    onEmail: (email: string) => void
}

type PlatformCallbackParams = {
    log: FastifyBaseLogger
    record: SsoStateRecord
    code: string
    redirectUri: string
    ip: string | undefined
    onEmail: (email: string) => void
}

type CompleteTestParams = {
    log: FastifyBaseLogger
    record: SsoStateRecord
    profile: SsoProfile
    binding: ExternalIdentityRecord | null
}

type StoreRefreshTokenParams = {
    log: FastifyBaseLogger
    policy: RuntimePolicy
    tenantId: string
    externalIdentityId: string
    refreshToken: string | null
}

type FailureParams = {
    error: unknown
    record: SsoStateRecord | null
    email: string | null
}
