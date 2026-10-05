import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { cryptoUtils } from '@fema-ipaas/server-utils'
import {
    ApplicationEventName,
    AuthenticationResponse,
    SsoLoginErrorCode,
    SsoProvider,
    User,
    UserIdentity,
    UserIdentityProvider,
    UserStatus,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { authenticationUtils, isDomainAllowed } from '../authentication/authentication-utils'
import { signupNames } from '../authentication/lib/signup-names'
import { userIdentityService } from '../authentication/user-identity/user-identity-service'
import { applicationEvents } from '../helper/application-events'
import { projectMemberService } from '../project/project-member.service'
import { tenantService } from '../tenant/tenant.service'
import { userService } from '../user/user-service'
import { userInvitationsService } from '../user-invitations/user-invitation.service'
import { feishuClient } from './feishu-client'
import { oidcClient } from './oidc-client'
import { RuntimeFeishu, RuntimeOidc, ssoConfigService } from './sso-config.service'
import { SsoLoginError } from './sso-errors'
import { ssoProfile, SsoProfile } from './sso-profile'
import { SsoMode, ssoState, SsoStateRecord } from './sso-state'

export const ssoLoginService = (log: FastifyBaseLogger) => ({
    async start({ tenantId, provider, mode, actorUserId }: StartParams): Promise<StartResult> {
        const runtime = await loadRuntime({ log, tenantId, provider })
        if (isNil(runtime)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is not configured' })
        }
        if (mode === 'login' && !runtime.enabled) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is turned off' })
        }
        const redirectUri = await ssoConfigService(log).redirectUri()
        const begun = await ssoState.begin({ tenantId, provider, mode, actorUserId })
        const redirectUrl = await buildAuthorizationUrl({ runtime, redirectUri, begun })
        return { redirectUrl, binding: begun.binding }
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
            if (isNil(query.code) || query.code.length === 0) {
                throw new SsoLoginError({ code: SsoLoginErrorCode.CODE_REJECTED, detail: 'The callback carries no authorization code' })
            }
            const runtime = await loadRuntime({ log, tenantId: record.tenantId, provider: record.provider })
            if (isNil(runtime) || (record.mode === 'login' && !runtime.enabled)) {
                throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_NOT_ENABLED, detail: 'This sign-in method is not available' })
            }
            const redirectUri = await ssoConfigService(log).redirectUri()
            const profile = await fetchProfile({ runtime, record, code: query.code, redirectUri })
            email = profile.email
            await assertProfileAllowed({ log, runtime, profile, tenantId: record.tenantId })
            if (record.mode === 'test') {
                await completeTest({ log, record, profile })
                return { ok: true, kind: 'test', provider: record.provider, tenantId: record.tenantId }
            }
            const resolved = await resolveUser({ log, runtime, profile, tenantId: record.tenantId, provider: record.provider, ip })
            await ssoConfigService(log).markLoggedIn({ tenantId: record.tenantId, provider: record.provider })
            const ticket = await ssoState.issueTicket({ userId: resolved.userId, tenantId: record.tenantId })
            return { ok: true, kind: 'login', provider: record.provider, tenantId: record.tenantId, ticket }
        }
        catch (error) {
            return failureFrom({ error, record, email })
        }
    },

    async redeemTicket({ ticket }: { ticket: string }): Promise<AuthenticationResponse> {
        const redeemed = await ssoState.redeemTicket({ ticket })
        return authenticationUtils(log).getProjectAndToken({
            userId: redeemed.userId,
            tenantId: redeemed.tenantId,
            projectId: null,
        })
    },
})

async function loadRuntime({ log, tenantId, provider }: LoadRuntimeParams): Promise<Runtime | null> {
    if (provider === SsoProvider.OIDC) {
        const oidc = await ssoConfigService(log).getRuntimeOidc({ tenantId })
        return isNil(oidc) ? null : { kind: SsoProvider.OIDC, enabled: oidc.stored.enabled, oidc }
    }
    const feishu = await ssoConfigService(log).getRuntimeFeishu({ tenantId })
    return isNil(feishu) ? null : { kind: SsoProvider.FEISHU, enabled: feishu.stored.enabled, feishu }
}

async function buildAuthorizationUrl({ runtime, redirectUri, begun }: BuildUrlParams): Promise<string> {
    if (runtime.kind === SsoProvider.OIDC) {
        const discovery = await oidcClient.discover({ issuer: runtime.oidc.stored.issuer })
        return oidcClient.buildAuthorizationUrl({
            discovery,
            clientId: runtime.oidc.stored.clientId,
            redirectUri,
            scopes: runtime.oidc.stored.scopes,
            state: begun.state,
            nonce: begun.record.nonce,
            codeVerifier: begun.record.codeVerifier,
        })
    }
    return feishuClient.buildAuthorizationUrl({
        region: runtime.feishu.stored.region,
        appId: runtime.feishu.stored.appId,
        redirectUri,
        state: begun.state,
        codeChallenge: oidcClient.challengeFor(begun.record.codeVerifier),
    })
}

async function fetchProfile({ runtime, record, code, redirectUri }: FetchProfileParams): Promise<SsoProfile> {
    if (runtime.kind === SsoProvider.OIDC) {
        const { stored, clientSecret } = runtime.oidc
        const discovery = await oidcClient.discover({ issuer: stored.issuer })
        const tokens = await oidcClient.exchangeCode({ discovery, clientId: stored.clientId, clientSecret, code, redirectUri, codeVerifier: record.codeVerifier })
        const claims = await oidcClient.verifyIdToken({ idToken: tokens.idToken, discovery, clientId: stored.clientId, nonce: record.nonce })
        const groupsClaim = stored.roleMapping?.claim ?? null
        const missingEmail = typeof ssoProfile.claimValue({ claims, path: stored.emailClaim }) !== 'string'
        const missingGroups = !isNil(groupsClaim) && isNil(ssoProfile.claimValue({ claims, path: groupsClaim }))
        const subject = typeof claims['sub'] === 'string' ? claims['sub'] : ''
        const extra = missingEmail || missingGroups
            ? await oidcClient.fetchUserinfo({ discovery, accessToken: tokens.accessToken, subject })
            : {}
        return ssoProfile.fromClaims({ claims: { ...extra, ...claims }, emailClaim: stored.emailClaim, groupsClaim })
    }
    const { stored, appSecret } = runtime.feishu
    const feishu = await feishuClient.fetchProfile({
        region: stored.region,
        appId: stored.appId,
        appSecret,
        code,
        redirectUri,
        codeVerifier: record.codeVerifier,
    })
    const enterpriseKey = stored.allowedEnterpriseKey ?? null
    if (!isNil(enterpriseKey) && feishu.enterpriseKey !== enterpriseKey) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH, detail: 'The Feishu account belongs to a different enterprise' })
    }
    const names = signupNames.splitFullName({ fullName: feishu.fullName, email: feishu.email })
    return {
        subject: feishu.subject,
        email: feishu.email,
        emailVerified: true,
        fullName: feishu.fullName,
        givenName: names.firstName,
        familyName: names.lastName,
        groups: [],
    }
}

async function assertProfileAllowed({ log, runtime, profile, tenantId }: AssertProfileParams): Promise<void> {
    const common = runtime.kind === SsoProvider.OIDC ? runtime.oidc.stored : runtime.feishu.stored
    const requireVerifiedEmail = runtime.kind === SsoProvider.OIDC ? runtime.oidc.stored.requireVerifiedEmail : false
    ssoProfile.assertUsable({ profile, requireVerifiedEmail })
    ssoProfile.assertDomainListed({ email: profile.email, allowedDomains: common.allowedDomains })
    const tenant = await tenantService(log).getOneOrThrow(tenantId)
    if (!isDomainAllowed({ email: profile.email, enforce: tenant.enforceAllowedAuthDomains, allowedDomains: tenant.allowedAuthDomains })) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.DOMAIN_NOT_ALLOWED, detail: `The email domain of ${profile.email} is not allowed to sign in to this tenant` })
    }
}

async function completeTest({ log, record, profile }: CompleteTestParams): Promise<void> {
    const actor = isNil(record.actorUserId) ? null : await userService(log).get({ id: record.actorUserId })
    const actorIdentity = isNil(actor) ? null : await userIdentityService(log).getOneOrFail({ id: actor.identityId })
    if (isNil(actorIdentity) || actorIdentity.email.toLowerCase() !== profile.email) {
        throw new SsoLoginError({
            code: SsoLoginErrorCode.TEST_ACCOUNT_MISMATCH,
            detail: `The test sign-in returned ${profile.email}, which is not the email of the administrator running the test`,
        })
    }
    await ssoConfigService(log).markVerified({ tenantId: record.tenantId, provider: record.provider })
}

async function resolveUser({ log, runtime, profile, tenantId, provider, ip }: ResolveUserParams): Promise<ResolvedUser> {
    const common = runtime.kind === SsoProvider.OIDC ? runtime.oidc.stored : runtime.feishu.stored
    const identity = await userIdentityService(log).getIdentityByEmail(profile.email)
    const existingUser = isNil(identity) ? null : await userService(log).getOneByIdentityAndTenant({ identityId: identity.id, tenantId })
    if (!isNil(existingUser) && !isNil(identity)) {
        return signInExisting({ log, user: existingUser, identity, profile, runtime, tenantId, provider, ip })
    }
    const invited = await userInvitationsService(log).hasAnyAcceptedInvitations({ tenantId, email: profile.email })
    if (!common.autoCreateUsers && !invited) {
        throw new SsoLoginError({
            code: SsoLoginErrorCode.USER_NOT_PROVISIONED,
            detail: `No account exists for ${profile.email} in this tenant and automatic account creation is off`,
        })
    }
    const readyIdentity = await ensureVerifiedIdentity({ log, identity, profile, provider })
    const created = await userService(log).getOrCreateWithProject({ identity: readyIdentity, tenantId })
    const role = ssoProfile.resolveRole({ groups: profile.groups, roleMapping: common.roleMapping, defaultRole: common.defaultRole })
    if (role !== created.tenantRole) {
        await userService(log).update({ id: created.id, tenantId, tenantRole: role })
    }
    if (!isNil(common.defaultProject)) {
        await projectMemberService(log).upsert({ projectId: common.defaultProject.projectId, userId: created.id, role: common.defaultProject.role })
    }
    await userInvitationsService(log).provisionUserInvitation({ email: profile.email })
    applicationEvents(log).sendUserEvent({ tenantId, userId: created.id, ip }, {
        action: ApplicationEventName.USER_SIGNED_UP,
        data: { source: 'sso' },
    })
    return { userId: created.id }
}

async function signInExisting({ log, user, identity, profile, runtime, tenantId, provider, ip }: SignInExistingParams): Promise<ResolvedUser> {
    if (user.status === UserStatus.INACTIVE) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.USER_DISABLED, detail: `The account ${profile.email} has been disabled` })
    }
    await ensureVerifiedIdentity({ log, identity, profile, provider })
    const common = runtime.kind === SsoProvider.OIDC ? runtime.oidc.stored : runtime.feishu.stored
    const tenant = await tenantService(log).getOneOrThrow(tenantId)
    const shouldSync = common.roleMapping?.syncOnLogin === true && tenant.ownerId !== user.id
    if (shouldSync) {
        const role = ssoProfile.resolveRole({ groups: profile.groups, roleMapping: common.roleMapping, defaultRole: common.defaultRole })
        if (role !== user.tenantRole) {
            await userService(log).update({ id: user.id, tenantId, tenantRole: role })
            applicationEvents(log).sendUserEvent({ tenantId, userId: user.id, ip }, {
                action: ApplicationEventName.TENANT_USER_ACCESS_CHANGED,
                data: { target: profile.email, detail: `${role} (synced from ${provider})` },
            })
        }
    }
    await userInvitationsService(log).provisionUserInvitation({ email: profile.email })
    return { userId: user.id }
}

async function ensureVerifiedIdentity({ log, identity, profile, provider }: EnsureIdentityParams): Promise<UserIdentity> {
    if (isNil(identity)) {
        const split = signupNames.splitFullName({ fullName: profile.fullName, email: profile.email })
        return userIdentityService(log).create({
            email: profile.email,
            password: await cryptoUtils.generateRandomPassword(),
            firstName: profile.givenName.length > 0 ? profile.givenName : split.firstName,
            lastName: profile.familyName.length > 0 ? profile.familyName : split.lastName,
            trackEvents: false,
            newsLetter: false,
            provider: provider === SsoProvider.OIDC ? UserIdentityProvider.OIDC : UserIdentityProvider.FEISHU,
            verified: true,
        })
    }
    if (!identity.verified) {
        return userIdentityService(log).verifyAndDiscardPassword(identity.id)
    }
    return identity
}

function failureFrom({ error, record, email }: FailureParams): CallbackOutcome {
    if (error instanceof SsoLoginError) {
        return { ok: false, code: error.code, detail: error.detail, tenantId: record?.tenantId ?? null, provider: record?.provider ?? null, mode: record?.mode ?? 'login', email }
    }
    if (error instanceof ApplicationError && error.error.code === ErrorCode.USER_IS_INACTIVE) {
        return { ok: false, code: SsoLoginErrorCode.USER_DISABLED, detail: 'The account has been disabled', tenantId: record?.tenantId ?? null, provider: record?.provider ?? null, mode: record?.mode ?? 'login', email }
    }
    const detail = error instanceof Error ? error.message : 'unexpected error'
    return { ok: false, code: SsoLoginErrorCode.UNKNOWN, detail, tenantId: record?.tenantId ?? null, provider: record?.provider ?? null, mode: record?.mode ?? 'login', email }
}

export type CallbackOutcome =
    | { ok: true, kind: 'login', provider: SsoProvider, tenantId: string, ticket: string }
    | { ok: true, kind: 'test', provider: SsoProvider, tenantId: string }
    | { ok: false, code: SsoLoginErrorCode, detail: string, tenantId: string | null, provider: SsoProvider | null, mode: SsoMode, email: string | null }

type Runtime =
    | { kind: SsoProvider.OIDC, enabled: boolean, oidc: RuntimeOidc }
    | { kind: SsoProvider.FEISHU, enabled: boolean, feishu: RuntimeFeishu }

type StartParams = {
    tenantId: string
    provider: SsoProvider
    mode: SsoMode
    actorUserId: string | null
}

type StartResult = {
    redirectUrl: string
    binding: string
}

type CallbackParams = {
    query: {
        code?: string
        state?: string
        error?: string
        error_description?: string
    }
    binding: string | null
    ip: string | undefined
}

type LoadRuntimeParams = {
    log: FastifyBaseLogger
    tenantId: string
    provider: SsoProvider
}

type BuildUrlParams = {
    runtime: Runtime
    redirectUri: string
    begun: { state: string, record: SsoStateRecord }
}

type FetchProfileParams = {
    runtime: Runtime
    record: SsoStateRecord
    code: string
    redirectUri: string
}

type AssertProfileParams = {
    log: FastifyBaseLogger
    runtime: Runtime
    profile: SsoProfile
    tenantId: string
}

type CompleteTestParams = {
    log: FastifyBaseLogger
    record: SsoStateRecord
    profile: SsoProfile
}

type ResolveUserParams = {
    log: FastifyBaseLogger
    runtime: Runtime
    profile: SsoProfile
    tenantId: string
    provider: SsoProvider
    ip: string | undefined
}

type SignInExistingParams = ResolveUserParams & {
    user: User
    identity: UserIdentity
}

type EnsureIdentityParams = {
    log: FastifyBaseLogger
    identity: UserIdentity | null
    profile: SsoProfile
    provider: SsoProvider
}

type ResolvedUser = {
    userId: string
}

type FailureParams = {
    error: unknown
    record: SsoStateRecord | null
    email: string | null
}
