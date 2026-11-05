import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import {
    FederatedAuthnProviderConfig,
    PlatformAppBinding,
    PlatformLoginAppKind,
    SsoEncryptedSecret,
    SsoMatchBy,
    SsoProvider,
    SsoProviderOption,
    SsoScope,
    SsoSettings,
    StoredDingtalkSso,
    StoredFeishuSso,
    StoredOidcSso,
    StoredSamlSso,
    StoredWecomSso,
    Tenant,
    UpdateDingtalkSsoRequestBody,
    UpdateFeishuSsoRequestBody,
    UpdateOidcSsoRequestBody,
    UpdateSamlSsoRequestBody,
    UpdateWecomSsoRequestBody,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { distributedLock } from '../database/redis-connections'
import { externalIdentityService } from '../federation/external-identity.service'
import { domainHelper } from '../helper/domain-helper'
import { encryptUtils } from '../helper/encryption'
import { projectService } from '../project/project-service'
import { tenantRepo, tenantService } from '../tenant/tenant.service'
import { oidcClient } from './oidc-client'
import { platformLoginAppsService } from './platform-login-apps.service'
import { samlClient, ServiceProviderUrls } from './saml-client'
import { isSsoLoginError } from './sso-errors'
import { ssoScopeUtils } from './sso-scope-utils'
import { ssoSettingsView } from './sso-settings-view'

export const ssoConfigService = (log: FastifyBaseLogger) => ({
    async getSettings({ tenantId }: TenantParams): Promise<SsoSettings> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        const providers = tenant.federatedAuthProviders
        const sp = await ssoConfigService(log).serviceProviderUrls({ tenantId })
        return {
            oidc: isNil(providers.oidc) ? null : ssoSettingsView.toOidcSettings(providers.oidc),
            feishu: isNil(providers.feishu) ? null : ssoSettingsView.toFeishuSettings(providers.feishu),
            wecom: isNil(providers.wecom) ? null : ssoSettingsView.toWecomSettings(providers.wecom),
            dingtalk: isNil(providers.dingtalk) ? null : ssoSettingsView.toDingtalkSettings(providers.dingtalk),
            saml: isNil(providers.saml2) ? null : ssoSettingsView.toSamlSettings({ stored: providers.saml2, sp }),
            samlServiceProvider: { spEntityId: sp.entityId, acsUrl: sp.acsUrl, spMetadataUrl: sp.metadataUrl },
            platformAppBindings: ssoSettingsView.toBindingViews(providers.platformAppBindings),
            availablePlatformApps: await platformLoginAppsService.listEnabledKinds(),
            redirectUri: await ssoConfigService(log).redirectUri(),
        }
    },

    async redirectUri(): Promise<string> {
        return domainHelper.getPublicApiUrl({ path: SSO_CALLBACK_PATH })
    },

    async serviceProviderUrls({ tenantId }: TenantParams): Promise<ServiceProviderUrls> {
        return samlClient.serviceProviderUrls({ apiBase: await domainHelper.getPublicApiUrl({ path: '' }), tenantId })
    },

    async saveOidc({ tenantId, request }: SaveOidcParams): Promise<SaveResult> {
        return withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            await assertDefaultProjectInTenant({ log, tenantId, defaultProject: request.defaultProject })
            const previous = tenant.federatedAuthProviders.oidc ?? null
            if (previous?.provisioned === true) {
                assertProvisionedUnchanged({ previous, request })
            }
            else {
                await assertDiscoverable({ issuer: request.issuer })
            }
            const clientSecret = await resolveSecret({ provided: request.clientSecret, previous: previous?.clientSecret ?? null })
            const matchBy = request.matchBy ?? previous?.matchBy ?? SsoMatchBy.EMAIL
            const extraAuthParams = request.extraAuthParams ?? previous?.extraAuthParams ?? {}
            const eventSigningSecret = previous?.eventSigningSecret
            const credentialsChanged = isNil(previous)
                || previous.issuer !== request.issuer
                || previous.clientId !== request.clientId
                || !isNil(request.clientSecret)
                || previous.emailClaim !== request.emailClaim
                || previous.requireVerifiedEmail !== request.requireVerifiedEmail
                || (previous.matchBy ?? SsoMatchBy.EMAIL) !== matchBy
                || JSON.stringify(previous.extraAuthParams ?? {}) !== JSON.stringify(extraAuthParams)
            const verifiedAt = credentialsChanged ? null : previous.verifiedAt ?? null
            assertEnableAllowed({ enabled: request.enabled, verifiedAt })
            const next: StoredOidcSso = {
                ...commonFields({ request, previous, verifiedAt }),
                roleMapping: request.roleMapping ?? null,
                issuer: request.issuer,
                clientId: request.clientId,
                clientSecret,
                scopes: ssoScopeUtils.ensureOpenid(request.scopes),
                emailClaim: request.emailClaim,
                requireVerifiedEmail: request.requireVerifiedEmail,
                matchBy,
                extraAuthParams,
                sessionRecheckMinutes: request.sessionRecheckMinutes === undefined ? previous?.sessionRecheckMinutes ?? null : request.sessionRecheckMinutes,
                provisioned: previous?.provisioned ?? false,
                ...(isNil(eventSigningSecret) ? {} : { eventSigningSecret }),
            }
            await persist({ tenant, next: { ...tenant.federatedAuthProviders, oidc: next } })
            return { settings: await ssoConfigService(log).getSettings({ tenantId }), changed: changedFields({ previous, next, secretProvided: !isNil(request.clientSecret) }) }
        } })
    },

    async saveFeishu({ tenantId, request }: SaveFeishuParams): Promise<SaveResult> {
        return withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            await assertDefaultProjectInTenant({ log, tenantId, defaultProject: request.defaultProject })
            const previous = tenant.federatedAuthProviders.feishu ?? null
            const appSecret = await resolveSecret({ provided: request.appSecret, previous: previous?.appSecret ?? null })
            const enterpriseKey = emptyToNull(request.allowedEnterpriseKey)
            const credentialsChanged = isNil(previous)
                || previous.appId !== request.appId
                || previous.region !== request.region
                || !isNil(request.appSecret)
                || (previous.allowedEnterpriseKey ?? null) !== enterpriseKey
            const verifiedAt = credentialsChanged ? null : previous.verifiedAt ?? null
            assertEnableAllowed({ enabled: request.enabled, verifiedAt })
            const next: StoredFeishuSso = {
                ...commonFields({ request, previous, verifiedAt }),
                roleMapping: null,
                appId: request.appId,
                appSecret,
                region: request.region,
                allowedEnterpriseKey: enterpriseKey,
            }
            await persist({ tenant, next: { ...tenant.federatedAuthProviders, feishu: next } })
            return { settings: await ssoConfigService(log).getSettings({ tenantId }), changed: changedFields({ previous, next, secretProvided: !isNil(request.appSecret) }) }
        } })
    },

    async saveWecom({ tenantId, request }: SaveWecomParams): Promise<SaveResult> {
        return withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            await assertDefaultProjectInTenant({ log, tenantId, defaultProject: request.defaultProject })
            const previous = tenant.federatedAuthProviders.wecom ?? null
            const secret = await resolveSecret({ provided: request.secret, previous: previous?.secret ?? null })
            const credentialsChanged = isNil(previous)
                || previous.corpId !== request.corpId
                || previous.agentId !== request.agentId
                || !isNil(request.secret)
            const verifiedAt = credentialsChanged ? null : previous.verifiedAt ?? null
            assertEnableAllowed({ enabled: request.enabled, verifiedAt })
            const next: StoredWecomSso = {
                ...commonFields({ request, previous, verifiedAt }),
                roleMapping: null,
                corpId: request.corpId,
                agentId: request.agentId,
                secret,
            }
            await persist({ tenant, next: { ...tenant.federatedAuthProviders, wecom: next } })
            return { settings: await ssoConfigService(log).getSettings({ tenantId }), changed: changedFields({ previous, next, secretProvided: !isNil(request.secret) }) }
        } })
    },

    async saveDingtalk({ tenantId, request }: SaveDingtalkParams): Promise<SaveResult> {
        return withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            await assertDefaultProjectInTenant({ log, tenantId, defaultProject: request.defaultProject })
            const previous = tenant.federatedAuthProviders.dingtalk ?? null
            const appSecret = await resolveSecret({ provided: request.appSecret, previous: previous?.appSecret ?? null })
            const corpId = emptyToNull(request.corpId)
            const credentialsChanged = isNil(previous)
                || previous.appKey !== request.appKey
                || (previous.corpId ?? null) !== corpId
                || !isNil(request.appSecret)
            const verifiedAt = credentialsChanged ? null : previous.verifiedAt ?? null
            assertEnableAllowed({ enabled: request.enabled, verifiedAt })
            const next: StoredDingtalkSso = {
                ...commonFields({ request, previous, verifiedAt }),
                roleMapping: null,
                appKey: request.appKey,
                appSecret,
                corpId,
            }
            await persist({ tenant, next: { ...tenant.federatedAuthProviders, dingtalk: next } })
            return { settings: await ssoConfigService(log).getSettings({ tenantId }), changed: changedFields({ previous, next, secretProvided: !isNil(request.appSecret) }) }
        } })
    },

    async saveSaml({ tenantId, request }: SaveSamlParams): Promise<SaveResult> {
        if (request.signAuthnRequests) {
            throw validation('Signed authentication requests are not supported')
        }
        return withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            await assertDefaultProjectInTenant({ log, tenantId, defaultProject: request.defaultProject })
            const previous = tenant.federatedAuthProviders.saml2 ?? null
            const idpMetadataXml = request.idpMetadataXml ?? previous?.idpMetadataXml
            if (isNil(idpMetadataXml) || idpMetadataXml.length === 0) {
                throw validation('The identity provider metadata is required')
            }
            const metadata = parseMetadata({ xml: idpMetadataXml })
            const firstNameAttribute = emptyToNull(request.firstNameAttribute)
            const lastNameAttribute = emptyToNull(request.lastNameAttribute)
            const subjectAttribute = emptyToNull(request.subjectAttribute)
            if (request.subjectSource === 'ATTRIBUTE' && isNil(subjectAttribute)) {
                throw validation('An attribute name is required when the subject comes from an attribute')
            }
            const credentialsChanged = isNil(previous)
                || previous.idpMetadataXml !== idpMetadataXml
                || previous.emailAttribute !== request.emailAttribute
                || previous.subjectSource !== request.subjectSource
                || (previous.subjectAttribute ?? null) !== subjectAttribute
            const verifiedAt = credentialsChanged ? null : previous.verifiedAt ?? null
            assertEnableAllowed({ enabled: request.enabled, verifiedAt })
            const next: StoredSamlSso = {
                ...commonFields({ request, previous, verifiedAt }),
                roleMapping: request.roleMapping ?? null,
                idpMetadataXml,
                idpEntityId: metadata.entityId,
                idpSsoUrl: metadata.ssoUrl,
                idpCertificates: metadata.certificates,
                emailAttribute: request.emailAttribute,
                firstNameAttribute,
                lastNameAttribute,
                subjectSource: request.subjectSource,
                subjectAttribute,
                signAuthnRequests: false,
            }
            await persist({ tenant, next: { ...tenant.federatedAuthProviders, saml2: next } })
            return { settings: await ssoConfigService(log).getSettings({ tenantId }), changed: changedFields({ previous, next, secretProvided: false }) }
        } })
    },

    async setEnabled({ tenantId, provider, enabled }: SetEnabledParams): Promise<SsoSettings> {
        return withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            const providers = tenant.federatedAuthProviders
            const current = ssoSettingsView.commonOf({ providers, provider })
            if (isNil(current)) {
                throw validation('Configure this sign-in method before turning it on')
            }
            assertEnableAllowed({ enabled, verifiedAt: current.verifiedAt ?? null })
            await persist({ tenant, next: ssoSettingsView.patchProvider({ providers, provider, patch: { enabled } }) })
            return ssoConfigService(log).getSettings({ tenantId })
        } })
    },

    async markVerified({ tenantId, provider }: ProviderParams): Promise<void> {
        await withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            const now = dayjs().toISOString()
            await persist({ tenant, next: ssoSettingsView.patchProvider({ providers: tenant.federatedAuthProviders, provider, patch: { verifiedAt: now } }) })
        } })
    },

    async markLoggedIn({ tenantId, provider }: ProviderParams): Promise<void> {
        await withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            const providers = tenant.federatedAuthProviders
            const now = dayjs().toISOString()
            const current = ssoSettingsView.commonOf({ providers, provider })
            await persist({ tenant, next: ssoSettingsView.patchProvider({ providers, provider, patch: { lastLoginAt: now, verifiedAt: current?.verifiedAt ?? now } }) })
        } })
    },

    async getRuntimeOidc({ tenantId }: TenantParams): Promise<RuntimeOidc | null> {
        const stored = (await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)).federatedAuthProviders.oidc
        return isNil(stored) ? null : { stored, clientSecret: await encryptUtils.decryptString(stored.clientSecret) }
    },

    async getRuntimeFeishu({ tenantId }: TenantParams): Promise<RuntimeFeishu | null> {
        const stored = (await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)).federatedAuthProviders.feishu
        return isNil(stored) ? null : { stored, appSecret: await encryptUtils.decryptString(stored.appSecret) }
    },

    async getRuntimeWecom({ tenantId }: TenantParams): Promise<RuntimeWecom | null> {
        const stored = (await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)).federatedAuthProviders.wecom
        return isNil(stored) ? null : { stored, secret: await encryptUtils.decryptString(stored.secret) }
    },

    async getRuntimeDingtalk({ tenantId }: TenantParams): Promise<RuntimeDingtalk | null> {
        const stored = (await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)).federatedAuthProviders.dingtalk
        return isNil(stored) ? null : { stored, appSecret: await encryptUtils.decryptString(stored.appSecret) }
    },

    async getStoredSaml({ tenantId }: TenantParams): Promise<StoredSamlSso | null> {
        const stored = (await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)).federatedAuthProviders.saml2
        return stored ?? null
    },

    async listPublicProviders({ tenantId }: TenantParams): Promise<SsoProviderOption[]> {
        const providers = (await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)).federatedAuthProviders
        return Object.values(SsoProvider).flatMap((provider) => {
            const stored = ssoSettingsView.commonOf({ providers, provider })
            return stored?.enabled === true ? [{ provider, label: stored.displayName, scope: SsoScope.TENANT }] : []
        })
    },

    async listPlatformProviders(): Promise<SsoProviderOption[]> {
        const kinds = await platformLoginAppsService.listEnabledKinds()
        return kinds.map((kind) => ({ provider: PLATFORM_KIND_PROVIDER[kind], label: PLATFORM_KIND_LABEL[kind], scope: SsoScope.PLATFORM }))
    },

    async hasVerifiedEnabledProvider({ tenantId }: TenantParams): Promise<boolean> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        return ssoSettingsView.hasVerifiedEnabled(tenant.federatedAuthProviders)
    },

    async findTenantIdByPlatformBinding({ kind, enterpriseKey }: PlatformBindingKey): Promise<string | null> {
        const rows = await tenantRepo().createQueryBuilder('tenant')
            .select('tenant.id', 'id')
            .where('tenant."federatedAuthProviders" -> \'platformAppBindings\' @> CAST(:needle AS jsonb)', { needle: JSON.stringify([{ kind, enterpriseKey }]) })
            .getRawMany<{ id: string }>()
        return rows[0]?.id ?? null
    },

    async addPlatformBinding({ tenantId, kind, enterpriseKey, enterpriseName }: AddPlatformBindingParams): Promise<void> {
        await distributedLock(log).runExclusive({
            key: `platform-binding-${kind}-${enterpriseKey}`,
            timeoutInSeconds: 30,
            fn: async () => {
                const holder = await ssoConfigService(log).findTenantIdByPlatformBinding({ kind, enterpriseKey })
                if (!isNil(holder) && holder !== tenantId) {
                    throw validation('This enterprise is already bound to another tenant')
                }
                await withTenantLock({ log, tenantId, fn: async () => {
                    const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
                    const binding: PlatformAppBinding = { kind, enterpriseKey, enterpriseName, boundAt: dayjs().toISOString() }
                    const rest = (tenant.federatedAuthProviders.platformAppBindings ?? []).filter((existing) => existing.kind !== kind)
                    await persist({ tenant, next: { ...tenant.federatedAuthProviders, platformAppBindings: [...rest, binding] } })
                } })
            },
        })
    },

    async removePlatformBinding({ tenantId, kind }: { tenantId: string, kind: PlatformLoginAppKind }): Promise<SsoSettings> {
        return withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            const rest = (tenant.federatedAuthProviders.platformAppBindings ?? []).filter((existing) => existing.kind !== kind)
            await persist({ tenant, next: { ...tenant.federatedAuthProviders, platformAppBindings: rest } })
            return ssoConfigService(log).getSettings({ tenantId })
        } })
    },

    async rotateSecrets(): Promise<SecretRotationReport> {
        const tenants = await tenantRepo().createQueryBuilder('tenant').addSelect('tenant.federatedAuthProviders').getMany()
        const report: SecretRotationReport = { scanned: 0, rotated: 0, failed: 0 }
        for (const tenant of tenants) {
            const providers = tenant.federatedAuthProviders
            if (Object.values(SsoProvider).every((provider) => isNil(ssoSettingsView.commonOf({ providers, provider })))) {
                continue
            }
            report.scanned += 1
            try {
                const rotatedProviders = await rotateProviderSecrets({ providers })
                if (isNil(rotatedProviders)) {
                    continue
                }
                await persist({ tenant, next: rotatedProviders })
                report.rotated += 1
            }
            catch (error) {
                report.failed += 1
                log.error({ error, tenant: { id: tenant.id } }, 'failed to rotate encryption key for single sign-on secrets')
            }
        }
        const platformRotated = await platformLoginAppsService.rotateSecrets()
        const tokensRotated = await externalIdentityService(log).rotateRefreshTokens()
        return { ...report, rotated: report.rotated + platformRotated + tokensRotated }
    },
})

async function rotateProviderSecrets({ providers }: { providers: FederatedAuthnProviderConfig }): Promise<FederatedAuthnProviderConfig | null> {
    const [oidcSecret, oidcSigning, feishuSecret, wecomSecret, dingtalkSecret] = await Promise.all([
        rotateSecret(providers.oidc?.clientSecret),
        rotateSecret(providers.oidc?.eventSigningSecret),
        rotateSecret(providers.feishu?.appSecret),
        rotateSecret(providers.wecom?.secret),
        rotateSecret(providers.dingtalk?.appSecret),
    ])
    if ([oidcSecret, oidcSigning, feishuSecret, wecomSecret, dingtalkSecret].every(isNil)) {
        return null
    }
    return {
        ...providers,
        ...(isNil(providers.oidc) || (isNil(oidcSecret) && isNil(oidcSigning))
            ? {}
            : { oidc: { ...providers.oidc, ...(isNil(oidcSecret) ? {} : { clientSecret: oidcSecret }), ...(isNil(oidcSigning) ? {} : { eventSigningSecret: oidcSigning }) } }),
        ...(isNil(providers.feishu) || isNil(feishuSecret) ? {} : { feishu: { ...providers.feishu, appSecret: feishuSecret } }),
        ...(isNil(providers.wecom) || isNil(wecomSecret) ? {} : { wecom: { ...providers.wecom, secret: wecomSecret } }),
        ...(isNil(providers.dingtalk) || isNil(dingtalkSecret) ? {} : { dingtalk: { ...providers.dingtalk, appSecret: dingtalkSecret } }),
    }
}

async function rotateSecret(secret: SsoEncryptedSecret | undefined): Promise<SsoEncryptedSecret | null> {
    if (isNil(secret) || await encryptUtils.isEncryptedWithCurrentKey(secret)) {
        return null
    }
    return encryptUtils.encryptString(await encryptUtils.decryptString(secret))
}

async function withTenantLock<T>({ log, tenantId, fn }: WithTenantLockParams<T>): Promise<T> {
    return distributedLock(log).runExclusive({
        key: `sso-settings-${tenantId}`,
        timeoutInSeconds: 30,
        fn,
    })
}

async function persist({ tenant, next }: PersistParams): Promise<void> {
    if (tenant.emailAuthEnabled === false && !ssoSettingsView.hasVerifiedEnabled(next)) {
        throw validation('Password sign-in is off, so at least one verified single sign-on method must stay on')
    }
    await tenantRepo().update({ id: tenant.id }, { federatedAuthProviders: next })
}

async function assertDiscoverable({ issuer }: { issuer: string }): Promise<void> {
    try {
        await oidcClient.discover({ issuer, forceRefresh: true })
    }
    catch (error) {
        if (isSsoLoginError(error)) {
            throw validation(error.detail)
        }
        throw error
    }
}

function parseMetadata({ xml }: { xml: string }) {
    try {
        return samlClient.parseIdpMetadata({ xml })
    }
    catch (error) {
        if (isSsoLoginError(error)) {
            throw validation(error.detail)
        }
        throw error
    }
}

function assertProvisionedUnchanged({ previous, request }: { previous: StoredOidcSso, request: UpdateOidcSsoRequestBody }): void {
    const locked = request.issuer !== previous.issuer
        || request.clientId !== previous.clientId
        || !isNil(request.clientSecret)
        || ssoScopeUtils.ensureOpenid(request.scopes) !== previous.scopes
        || request.emailClaim !== previous.emailClaim
        || request.requireVerifiedEmail !== previous.requireVerifiedEmail
        || (!isNil(request.matchBy) && request.matchBy !== (previous.matchBy ?? SsoMatchBy.EMAIL))
        || (!isNil(request.extraAuthParams) && JSON.stringify(request.extraAuthParams) !== JSON.stringify(previous.extraAuthParams ?? {}))
        || (request.sessionRecheckMinutes !== undefined && request.sessionRecheckMinutes !== (previous.sessionRecheckMinutes ?? null))
    if (locked) {
        throw validation('This connection was set up by the platform; only the display name, the switch and the access rules can be changed')
    }
}

async function assertDefaultProjectInTenant({ log, tenantId, defaultProject }: AssertDefaultProjectParams): Promise<void> {
    if (isNil(defaultProject)) {
        return
    }
    const project = await projectService(log).getOne(defaultProject.projectId)
    if (isNil(project) || project.tenantId !== tenantId) {
        throw validation('The default project does not exist in this tenant')
    }
}

async function resolveSecret({ provided, previous }: ResolveSecretParams): Promise<SsoEncryptedSecret> {
    if (!isNil(provided)) {
        return encryptUtils.encryptString(provided)
    }
    if (isNil(previous)) {
        throw validation('A client secret is required')
    }
    return previous
}

function assertEnableAllowed({ enabled, verifiedAt }: { enabled: boolean, verifiedAt: string | null }): void {
    if (enabled && isNil(verifiedAt)) {
        throw validation('Run a successful test sign-in before turning this method on')
    }
}

function commonFields({ request, previous, verifiedAt }: CommonFieldsParams) {
    return {
        enabled: request.enabled,
        displayName: request.displayName,
        allowedDomains: normalizeDomains(request.allowedDomains),
        autoCreateUsers: request.autoCreateUsers,
        defaultRole: request.defaultRole,
        defaultProject: request.defaultProject ?? null,
        verifiedAt,
        lastLoginAt: previous?.lastLoginAt ?? null,
    }
}

function changedFields({ previous, next, secretProvided }: ChangedFieldsParams): string[] {
    const keys = Object.keys(next).filter((key) => !SECRET_KEYS.includes(key) && key !== 'verifiedAt' && key !== 'lastLoginAt')
    const before: Record<string, unknown> = isNil(previous) ? {} : { ...previous }
    const after: Record<string, unknown> = { ...next }
    const changed = keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    return secretProvided ? [...changed, 'secret'] : changed
}

function normalizeDomains(domains: string[]): string[] {
    return [...new Set(domains.map((domain) => domain.trim().toLowerCase()).filter((domain) => domain.length > 0))]
}

function emptyToNull(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? ''
    return trimmed.length === 0 ? null : trimmed
}

function validation(message: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

const SSO_CALLBACK_PATH = '/v1/authn/sso/callback'
const SECRET_KEYS = ['clientSecret', 'appSecret', 'secret', 'eventSigningSecret', 'idpMetadataXml']

const PLATFORM_KIND_PROVIDER: Record<PlatformLoginAppKind, SsoProvider> = {
    FEISHU: SsoProvider.FEISHU,
    WECOM: SsoProvider.WECOM,
    DINGTALK: SsoProvider.DINGTALK,
}

const PLATFORM_KIND_LABEL: Record<PlatformLoginAppKind, string> = {
    FEISHU: '飞书',
    WECOM: '企业微信',
    DINGTALK: '钉钉',
}

export const ssoConfigUtils = {
    hasVerifiedEnabled: ssoSettingsView.hasVerifiedEnabled,
    normalizeDomains,
}

export type RuntimeOidc = {
    stored: StoredOidcSso
    clientSecret: string
}

export type RuntimeFeishu = {
    stored: StoredFeishuSso
    appSecret: string
}

export type RuntimeWecom = {
    stored: StoredWecomSso
    secret: string
}

export type RuntimeDingtalk = {
    stored: StoredDingtalkSso
    appSecret: string
}

export type SecretRotationReport = {
    scanned: number
    rotated: number
    failed: number
}

export type SaveResult = {
    settings: SsoSettings
    changed: string[]
}

type TenantParams = {
    tenantId: string
}

type ProviderParams = TenantParams & {
    provider: SsoProvider
}

type SetEnabledParams = ProviderParams & {
    enabled: boolean
}

type SaveOidcParams = TenantParams & {
    request: UpdateOidcSsoRequestBody
}

type SaveFeishuParams = TenantParams & {
    request: UpdateFeishuSsoRequestBody
}

type SaveWecomParams = TenantParams & {
    request: UpdateWecomSsoRequestBody
}

type SaveDingtalkParams = TenantParams & {
    request: UpdateDingtalkSsoRequestBody
}

type SaveSamlParams = TenantParams & {
    request: UpdateSamlSsoRequestBody
}

type PlatformBindingKey = {
    kind: PlatformLoginAppKind
    enterpriseKey: string
}

type AddPlatformBindingParams = TenantParams & PlatformBindingKey & {
    enterpriseName: string
}

type WithTenantLockParams<T> = {
    log: FastifyBaseLogger
    tenantId: string
    fn: () => Promise<T>
}

type PersistParams = {
    tenant: Pick<Tenant, 'id' | 'emailAuthEnabled'>
    next: FederatedAuthnProviderConfig
}

type AssertDefaultProjectParams = {
    log: FastifyBaseLogger
    tenantId: string
    defaultProject: { projectId: string } | null | undefined
}

type ResolveSecretParams = {
    provided: string | undefined
    previous: SsoEncryptedSecret | null
}

type CommonFieldsParams = {
    request: {
        enabled: boolean
        displayName: string
        allowedDomains: string[]
        autoCreateUsers: boolean
        defaultRole: StoredOidcSso['defaultRole']
        defaultProject?: StoredOidcSso['defaultProject']
    }
    previous: { lastLoginAt?: string | null } | null
    verifiedAt: string | null
}

type ChangedFieldsParams = {
    previous: object | null
    next: object
    secretProvided: boolean
}
