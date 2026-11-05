import { isNil } from '@fema-ipaas/core-utils'
import {
    PlatformLoginAppKind,
    SsoDefaultProject,
    SsoLoginErrorCode,
    SsoMatchBy,
    SsoProvider,
    SsoRoleMapping,
    StoredSamlSso,
    TenantRole,
    UserIdentityProvider,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { signupNames } from '../authentication/lib/signup-names'
import { dingtalkClient } from './dingtalk-client'
import { feishuClient } from './feishu-client'
import { oidcClient } from './oidc-client'
import { PlatformLoginAppRuntime, platformLoginAppsService } from './platform-login-apps.service'
import { samlClient, ServiceProviderUrls } from './saml-client'
import { RuntimeDingtalk, RuntimeFeishu, RuntimeOidc, RuntimeWecom, ssoConfigService } from './sso-config.service'
import { SsoLoginError } from './sso-errors'
import { ssoProfile, SsoProfile } from './sso-profile'
import { ssoScopeUtils } from './sso-scope-utils'
import { ssoState, SsoStateRecord } from './sso-state'
import { wecomClient } from './wecom-client'

async function loadTenantRuntime({ log, tenantId, provider }: LoadTenantRuntimeParams): Promise<TenantRuntime | null> {
    const config = ssoConfigService(log)
    switch (provider) {
        case SsoProvider.OIDC: {
            const oidc = await config.getRuntimeOidc({ tenantId })
            return isNil(oidc) ? null : { kind: SsoProvider.OIDC, enabled: oidc.stored.enabled, oidc }
        }
        case SsoProvider.FEISHU: {
            const feishu = await config.getRuntimeFeishu({ tenantId })
            return isNil(feishu) ? null : { kind: SsoProvider.FEISHU, enabled: feishu.stored.enabled, feishu }
        }
        case SsoProvider.WECOM: {
            const wecom = await config.getRuntimeWecom({ tenantId })
            return isNil(wecom) ? null : { kind: SsoProvider.WECOM, enabled: wecom.stored.enabled, wecom }
        }
        case SsoProvider.DINGTALK: {
            const dingtalk = await config.getRuntimeDingtalk({ tenantId })
            return isNil(dingtalk) ? null : { kind: SsoProvider.DINGTALK, enabled: dingtalk.stored.enabled, dingtalk }
        }
        case SsoProvider.SAML: {
            const saml = await config.getStoredSaml({ tenantId })
            return isNil(saml) ? null : { kind: SsoProvider.SAML, enabled: saml.enabled, saml, sp: await config.serviceProviderUrls({ tenantId }) }
        }
    }
}

async function loadPlatformRuntime({ provider }: { provider: SsoProvider }): Promise<PlatformRuntime | null> {
    const kind = kindOf({ provider })
    if (isNil(kind)) {
        return null
    }
    const app = await platformLoginAppsService.getRuntime({ kind })
    return isNil(app) ? null : { kind, app }
}

function policyOf({ runtime }: { runtime: TenantRuntime }): RuntimePolicy {
    switch (runtime.kind) {
        case SsoProvider.OIDC: {
            const stored = runtime.oidc.stored
            const matchBy = stored.matchBy ?? SsoMatchBy.EMAIL
            return {
                ...commonPolicy({ stored }),
                issuer: stored.issuer,
                matchBy,
                requireVerifiedEmail: stored.requireVerifiedEmail,
                userProvider: UserIdentityProvider.OIDC,
                federated: matchBy === SsoMatchBy.SUBJECT,
            }
        }
        case SsoProvider.FEISHU:
            return { ...commonPolicy({ stored: runtime.feishu.stored }), issuer: feishuIssuer({ appId: runtime.feishu.stored.appId }), matchBy: SsoMatchBy.EMAIL, requireVerifiedEmail: false, userProvider: UserIdentityProvider.FEISHU, federated: false }
        case SsoProvider.WECOM:
            return { ...commonPolicy({ stored: runtime.wecom.stored }), issuer: wecomIssuer({ corpId: runtime.wecom.stored.corpId }), matchBy: SsoMatchBy.EMAIL, requireVerifiedEmail: false, userProvider: UserIdentityProvider.WECOM, federated: false }
        case SsoProvider.DINGTALK:
            return { ...commonPolicy({ stored: runtime.dingtalk.stored }), issuer: dingtalkIssuer({ appKey: runtime.dingtalk.stored.appKey }), matchBy: SsoMatchBy.EMAIL, requireVerifiedEmail: false, userProvider: UserIdentityProvider.DINGTALK, federated: false }
        case SsoProvider.SAML:
            return { ...commonPolicy({ stored: runtime.saml }), issuer: runtime.saml.idpEntityId, matchBy: SsoMatchBy.EMAIL, requireVerifiedEmail: false, userProvider: UserIdentityProvider.SAML, federated: false }
    }
}

async function buildTenantAuthorizationUrl({ runtime, redirectUri, begun }: BuildTenantUrlParams): Promise<string> {
    switch (runtime.kind) {
        case SsoProvider.OIDC: {
            const stored = runtime.oidc.stored
            const discovery = await oidcClient.discover({ issuer: stored.issuer })
            const wantsOfflineAccess = (stored.matchBy ?? SsoMatchBy.EMAIL) === SsoMatchBy.SUBJECT && discovery.scopesSupported.includes('offline_access')
            return oidcClient.buildAuthorizationUrl({
                discovery,
                clientId: stored.clientId,
                redirectUri,
                scopes: wantsOfflineAccess ? ssoScopeUtils.withScope({ scopes: stored.scopes, scope: 'offline_access' }) : stored.scopes,
                state: begun.state,
                nonce: begun.record.nonce,
                codeVerifier: begun.record.codeVerifier,
                extraParams: stored.extraAuthParams ?? {},
            })
        }
        case SsoProvider.FEISHU:
            return feishuClient.buildAuthorizationUrl({
                region: runtime.feishu.stored.region,
                appId: runtime.feishu.stored.appId,
                redirectUri,
                state: begun.state,
                codeChallenge: oidcClient.challengeFor(begun.record.codeVerifier),
            })
        case SsoProvider.WECOM:
            return wecomClient.buildAuthorizationUrl({
                corpId: runtime.wecom.stored.corpId,
                agentId: runtime.wecom.stored.agentId,
                redirectUri,
                state: begun.state,
            })
        case SsoProvider.DINGTALK:
            return dingtalkClient.buildAuthorizationUrl({
                appKey: runtime.dingtalk.stored.appKey,
                redirectUri,
                state: begun.state,
                withCorpId: !isNil(runtime.dingtalk.stored.corpId),
            })
        case SsoProvider.SAML:
            return samlClient.buildAuthorizationUrl({
                stored: runtime.saml,
                sp: runtime.sp,
                relayState: begun.state,
                requestId: begun.record.samlRequestId ?? '',
            })
    }
}

function buildPlatformAuthorizationUrl({ runtime, redirectUri, begun }: BuildPlatformUrlParams): string {
    switch (runtime.kind) {
        case 'FEISHU':
            return feishuClient.buildAuthorizationUrl({
                region: runtime.app.region,
                appId: runtime.app.appId,
                redirectUri,
                state: begun.state,
                codeChallenge: oidcClient.challengeFor(begun.record.codeVerifier),
            })
        case 'WECOM':
            return wecomClient.buildProviderAuthorizationUrl({ providerCorpId: runtime.app.appId, redirectUri, state: begun.state })
        case 'DINGTALK':
            return dingtalkClient.buildAuthorizationUrl({ appKey: runtime.app.appId, redirectUri, state: begun.state, withCorpId: true })
    }
}

async function fetchTenantProfile({ log, runtime, record, code, state, redirectUri }: FetchTenantProfileParams): Promise<FetchedProfile> {
    switch (runtime.kind) {
        case SsoProvider.OIDC:
            return fetchOidcProfile({ runtime: runtime.oidc, record, code, redirectUri })
        case SsoProvider.FEISHU: {
            const { stored, appSecret } = runtime.feishu
            const feishu = await feishuClient.fetchProfile({ region: stored.region, appId: stored.appId, appSecret, code, redirectUri, codeVerifier: record.codeVerifier })
            const enterpriseKey = stored.allowedEnterpriseKey ?? null
            if (!isNil(enterpriseKey) && feishu.enterpriseKey !== enterpriseKey) {
                throw new SsoLoginError({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH, detail: 'The Feishu account belongs to a different enterprise' })
            }
            return { profile: platformProfile({ subject: feishu.subject, email: feishu.email, fullName: feishu.fullName, enterpriseKey: feishu.enterpriseKey }), refreshToken: null }
        }
        case SsoProvider.WECOM: {
            const { stored, secret } = runtime.wecom
            const wecom = await wecomClient.fetchProfile({ corpId: stored.corpId, secret, code })
            return { profile: platformProfile({ subject: wecom.subject, email: wecom.email, fullName: wecom.fullName, enterpriseKey: wecom.enterpriseKey }), refreshToken: null }
        }
        case SsoProvider.DINGTALK: {
            const { stored, appSecret } = runtime.dingtalk
            const dingtalk = await dingtalkClient.fetchProfile({ appKey: stored.appKey, appSecret, code })
            const expectedCorp = stored.corpId ?? null
            if (!isNil(expectedCorp) && dingtalk.enterpriseKey !== expectedCorp) {
                throw new SsoLoginError({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH, detail: 'The DingTalk account belongs to a different enterprise' })
            }
            return { profile: platformProfile({ subject: dingtalk.subject, email: dingtalk.email, fullName: dingtalk.fullName, enterpriseKey: dingtalk.enterpriseKey }), refreshToken: null }
        }
        case SsoProvider.SAML:
            return fetchSamlProfile({ log, stored: runtime.saml, state })
    }
}

async function fetchPlatformProfile({ runtime, record, code, redirectUri }: FetchPlatformProfileParams): Promise<PlatformProfile> {
    switch (runtime.kind) {
        case 'FEISHU': {
            const feishu = await feishuClient.fetchProfile({ region: runtime.app.region, appId: runtime.app.appId, appSecret: runtime.app.appSecret, code, redirectUri, codeVerifier: record.codeVerifier })
            return finishPlatformProfile({ issuer: feishuIssuer({ appId: runtime.app.appId }), profile: platformProfile({ subject: feishu.subject, email: feishu.email, fullName: feishu.fullName, enterpriseKey: feishu.enterpriseKey }) })
        }
        case 'WECOM': {
            const wecom = await wecomClient.fetchProviderProfile({ providerCorpId: runtime.app.appId, providerSecret: runtime.app.appSecret, authCode: code })
            return finishPlatformProfile({ issuer: wecomIssuer({ corpId: wecom.enterpriseKey }), profile: platformProfile({ subject: wecom.subject, email: wecom.email, fullName: wecom.fullName, enterpriseKey: wecom.enterpriseKey }) })
        }
        case 'DINGTALK': {
            const dingtalk = await dingtalkClient.fetchProfile({ appKey: runtime.app.appId, appSecret: runtime.app.appSecret, code })
            return finishPlatformProfile({ issuer: dingtalkIssuer({ appKey: runtime.app.appId }), profile: platformProfile({ subject: dingtalk.subject, email: dingtalk.email, fullName: dingtalk.fullName, enterpriseKey: dingtalk.enterpriseKey }) })
        }
    }
}

async function fetchOidcProfile({ runtime, record, code, redirectUri }: FetchOidcProfileParams): Promise<FetchedProfile> {
    const { stored, clientSecret } = runtime
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
    const profile = ssoProfile.fromClaims({ claims: { ...extra, ...claims }, emailClaim: stored.emailClaim, groupsClaim })
    return { profile, refreshToken: tokens.refreshToken }
}

async function fetchSamlProfile({ stored, state }: { log: FastifyBaseLogger, stored: StoredSamlSso, state: string | undefined }): Promise<FetchedProfile> {
    const result = await ssoState.takeSamlResult({ state })
    if (!result.ok) {
        throw new SsoLoginError({ code: result.code, detail: result.detail })
    }
    const saml = samlClient.toProfile({ stored, assertion: { nameId: result.nameId, attributes: result.attributes } })
    const groupsClaim = stored.roleMapping?.claim ?? null
    const names = signupNames.splitFullName({ fullName: [saml.givenName, saml.familyName].filter((part) => part.length > 0).join(' '), email: saml.email })
    return {
        profile: {
            subject: saml.subject,
            email: saml.email,
            emailVerified: true,
            fullName: [saml.givenName, saml.familyName].filter((part) => part.length > 0).join(' '),
            givenName: saml.givenName.length > 0 ? saml.givenName : names.firstName,
            familyName: saml.familyName,
            groups: isNil(groupsClaim) ? [] : result.attributes[groupsClaim] ?? [],
            enterpriseKey: null,
            enterpriseName: null,
        },
        refreshToken: null,
    }
}

function platformProfile({ subject, email, fullName, enterpriseKey }: PlatformProfileParams): SsoProfile {
    const names = signupNames.splitFullName({ fullName, email })
    return {
        subject,
        email,
        emailVerified: true,
        fullName,
        givenName: names.firstName,
        familyName: names.lastName,
        groups: [],
        enterpriseKey,
        enterpriseName: null,
    }
}

function finishPlatformProfile({ issuer, profile }: { issuer: string, profile: SsoProfile }): PlatformProfile {
    if (isNil(profile.enterpriseKey) || profile.enterpriseKey.length === 0) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.ENTERPRISE_MISMATCH, detail: 'The identity provider did not say which enterprise the account belongs to' })
    }
    return { issuer, profile, enterpriseKey: profile.enterpriseKey }
}

function commonPolicy({ stored }: { stored: CommonStored }): CommonPolicy {
    return {
        allowedDomains: stored.allowedDomains,
        autoCreateUsers: stored.autoCreateUsers,
        defaultRole: stored.defaultRole,
        roleMapping: stored.roleMapping ?? null,
        defaultProject: stored.defaultProject ?? null,
    }
}

function kindOf({ provider }: { provider: SsoProvider }): PlatformLoginAppKind | null {
    switch (provider) {
        case SsoProvider.FEISHU:
            return 'FEISHU'
        case SsoProvider.WECOM:
            return 'WECOM'
        case SsoProvider.DINGTALK:
            return 'DINGTALK'
        default:
            return null
    }
}

function feishuIssuer({ appId }: { appId: string }): string {
    return `feishu:${appId}`
}

function wecomIssuer({ corpId }: { corpId: string }): string {
    return `wecom:${corpId}`
}

function dingtalkIssuer({ appKey }: { appKey: string }): string {
    return `dingtalk:${appKey}`
}

export const ssoRuntime = {
    loadTenantRuntime,
    loadPlatformRuntime,
    policyOf,
    buildTenantAuthorizationUrl,
    buildPlatformAuthorizationUrl,
    fetchTenantProfile,
    fetchPlatformProfile,
    kindOf,
    feishuIssuer,
    wecomIssuer,
    dingtalkIssuer,
}

export type TenantRuntime =
    | { kind: SsoProvider.OIDC, enabled: boolean, oidc: RuntimeOidc }
    | { kind: SsoProvider.FEISHU, enabled: boolean, feishu: RuntimeFeishu }
    | { kind: SsoProvider.WECOM, enabled: boolean, wecom: RuntimeWecom }
    | { kind: SsoProvider.DINGTALK, enabled: boolean, dingtalk: RuntimeDingtalk }
    | { kind: SsoProvider.SAML, enabled: boolean, saml: StoredSamlSso, sp: ServiceProviderUrls }

export type PlatformRuntime = {
    kind: PlatformLoginAppKind
    app: PlatformLoginAppRuntime
}

export type CommonPolicy = {
    allowedDomains: string[]
    autoCreateUsers: boolean
    defaultRole: TenantRole
    roleMapping: SsoRoleMapping | null
    defaultProject: SsoDefaultProject | null
}

export type RuntimePolicy = CommonPolicy & {
    issuer: string
    matchBy: SsoMatchBy
    requireVerifiedEmail: boolean
    userProvider: UserIdentityProvider
    federated: boolean
}

export type FetchedProfile = {
    profile: SsoProfile
    refreshToken: string | null
}

export type PlatformProfile = {
    issuer: string
    profile: SsoProfile
    enterpriseKey: string
}

type CommonStored = {
    allowedDomains: string[]
    autoCreateUsers: boolean
    defaultRole: TenantRole
    roleMapping?: SsoRoleMapping | null
    defaultProject?: SsoDefaultProject | null
}

type LoadTenantRuntimeParams = {
    log: FastifyBaseLogger
    tenantId: string
    provider: SsoProvider
}

type Begun = {
    state: string
    record: SsoStateRecord
}

type BuildTenantUrlParams = {
    runtime: TenantRuntime
    redirectUri: string
    begun: Begun
}

type BuildPlatformUrlParams = {
    runtime: PlatformRuntime
    redirectUri: string
    begun: Begun
}

type FetchTenantProfileParams = {
    log: FastifyBaseLogger
    runtime: TenantRuntime
    record: SsoStateRecord
    code: string
    state: string | undefined
    redirectUri: string
}

type FetchPlatformProfileParams = {
    runtime: PlatformRuntime
    record: SsoStateRecord
    code: string
    redirectUri: string
}

type FetchOidcProfileParams = {
    runtime: RuntimeOidc
    record: SsoStateRecord
    code: string
    redirectUri: string
}

type PlatformProfileParams = {
    subject: string
    email: string
    fullName: string
    enterpriseKey: string | null
}
