import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import {
    FederatedAuthnProviderConfig,
    FeishuSsoSettings,
    OidcSsoSettings,
    SsoProvider,
    SsoProviderOption,
    SsoSettings,
    StoredFeishuSso,
    StoredOidcSso,
    Tenant,
    UpdateFeishuSsoRequestBody,
    UpdateOidcSsoRequestBody,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedLock } from '../database/redis-connections'
import { domainHelper } from '../helper/domain-helper'
import { encryptUtils } from '../helper/encryption'
import { projectService } from '../project/project-service'
import { tenantRepo, tenantService } from '../tenant/tenant.service'
import { oidcClient } from './oidc-client'
import { isSsoLoginError } from './sso-errors'

export const ssoConfigService = (log: FastifyBaseLogger) => ({
    async getSettings({ tenantId }: TenantParams): Promise<SsoSettings> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        const providers = tenant.federatedAuthProviders
        return {
            oidc: isNil(providers.oidc) ? null : toOidcSettings(providers.oidc),
            feishu: isNil(providers.feishu) ? null : toFeishuSettings(providers.feishu),
            redirectUri: await ssoConfigService(log).redirectUri(),
        }
    },

    async redirectUri(): Promise<string> {
        return domainHelper.getPublicApiUrl({ path: SSO_CALLBACK_PATH })
    },

    async saveOidc({ tenantId, request }: SaveOidcParams): Promise<SaveResult> {
        await assertDiscoverable({ issuer: request.issuer })
        return withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            await assertDefaultProjectInTenant({ log, tenantId, defaultProject: request.defaultProject })
            const previous = tenant.federatedAuthProviders.oidc ?? null
            const clientSecret = await resolveSecret({ provided: request.clientSecret, previous: previous?.clientSecret ?? null })
            const credentialsChanged = isNil(previous)
                || previous.issuer !== request.issuer
                || previous.clientId !== request.clientId
                || !isNil(request.clientSecret)
                || previous.emailClaim !== request.emailClaim
                || previous.requireVerifiedEmail !== request.requireVerifiedEmail
            const verifiedAt = credentialsChanged ? null : previous.verifiedAt ?? null
            assertEnableAllowed({ enabled: request.enabled, verifiedAt })
            const next: StoredOidcSso = {
                enabled: request.enabled,
                displayName: request.displayName,
                allowedDomains: normalizeDomains(request.allowedDomains),
                autoCreateUsers: request.autoCreateUsers,
                defaultRole: request.defaultRole,
                roleMapping: request.roleMapping ?? null,
                defaultProject: request.defaultProject ?? null,
                verifiedAt,
                lastLoginAt: previous?.lastLoginAt ?? null,
                issuer: request.issuer,
                clientId: request.clientId,
                clientSecret,
                scopes: ensureOpenid(request.scopes),
                emailClaim: request.emailClaim,
                requireVerifiedEmail: request.requireVerifiedEmail,
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
                enabled: request.enabled,
                displayName: request.displayName,
                allowedDomains: normalizeDomains(request.allowedDomains),
                autoCreateUsers: request.autoCreateUsers,
                defaultRole: request.defaultRole,
                roleMapping: null,
                defaultProject: request.defaultProject ?? null,
                verifiedAt,
                lastLoginAt: previous?.lastLoginAt ?? null,
                appId: request.appId,
                appSecret,
                region: request.region,
                allowedEnterpriseKey: enterpriseKey,
            }
            await persist({ tenant, next: { ...tenant.federatedAuthProviders, feishu: next } })
            return { settings: await ssoConfigService(log).getSettings({ tenantId }), changed: changedFields({ previous, next, secretProvided: !isNil(request.appSecret) }) }
        } })
    },

    async setEnabled({ tenantId, provider, enabled }: SetEnabledParams): Promise<SsoSettings> {
        return withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            const providers = tenant.federatedAuthProviders
            const current = provider === SsoProvider.OIDC ? providers.oidc : providers.feishu
            if (isNil(current)) {
                throw validation('Configure this sign-in method before turning it on')
            }
            assertEnableAllowed({ enabled, verifiedAt: current.verifiedAt ?? null })
            const next = provider === SsoProvider.OIDC
                ? { ...providers, oidc: isNil(providers.oidc) ? null : { ...providers.oidc, enabled } }
                : { ...providers, feishu: isNil(providers.feishu) ? null : { ...providers.feishu, enabled } }
            await persist({ tenant, next })
            return ssoConfigService(log).getSettings({ tenantId })
        } })
    },

    async markVerified({ tenantId, provider }: ProviderParams): Promise<void> {
        await withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            const providers = tenant.federatedAuthProviders
            const now = new Date().toISOString()
            const next = provider === SsoProvider.OIDC
                ? { ...providers, oidc: isNil(providers.oidc) ? null : { ...providers.oidc, verifiedAt: now } }
                : { ...providers, feishu: isNil(providers.feishu) ? null : { ...providers.feishu, verifiedAt: now } }
            await persist({ tenant, next })
        } })
    },

    async markLoggedIn({ tenantId, provider }: ProviderParams): Promise<void> {
        await withTenantLock({ log, tenantId, fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            const providers = tenant.federatedAuthProviders
            const now = new Date().toISOString()
            const next = provider === SsoProvider.OIDC
                ? { ...providers, oidc: isNil(providers.oidc) ? null : { ...providers.oidc, lastLoginAt: now, verifiedAt: providers.oidc.verifiedAt ?? now } }
                : { ...providers, feishu: isNil(providers.feishu) ? null : { ...providers.feishu, lastLoginAt: now, verifiedAt: providers.feishu.verifiedAt ?? now } }
            await persist({ tenant, next })
        } })
    },

    async getRuntimeOidc({ tenantId }: TenantParams): Promise<RuntimeOidc | null> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        const stored = tenant.federatedAuthProviders.oidc
        if (isNil(stored)) {
            return null
        }
        return { stored, clientSecret: await encryptUtils.decryptString(stored.clientSecret) }
    },

    async getRuntimeFeishu({ tenantId }: TenantParams): Promise<RuntimeFeishu | null> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        const stored = tenant.federatedAuthProviders.feishu
        if (isNil(stored)) {
            return null
        }
        return { stored, appSecret: await encryptUtils.decryptString(stored.appSecret) }
    },

    async listPublicProviders({ tenantId }: TenantParams): Promise<SsoProviderOption[]> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        const providers = tenant.federatedAuthProviders
        return [
            ...(providers.oidc?.enabled === true ? [{ provider: SsoProvider.OIDC, label: providers.oidc.displayName }] : []),
            ...(providers.feishu?.enabled === true ? [{ provider: SsoProvider.FEISHU, label: providers.feishu.displayName }] : []),
        ]
    },

    async hasVerifiedEnabledProvider({ tenantId }: TenantParams): Promise<boolean> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        return hasVerifiedEnabled(tenant.federatedAuthProviders)
    },

    async rotateSecrets(): Promise<number> {
        const tenants = await tenantRepo().createQueryBuilder('tenant').addSelect('tenant.federatedAuthProviders').getMany()
        let rotated = 0
        for (const tenant of tenants) {
            const providers = tenant.federatedAuthProviders
            const oidcSecret = await rotateSecret(providers.oidc?.clientSecret)
            const feishuSecret = await rotateSecret(providers.feishu?.appSecret)
            if (isNil(oidcSecret) && isNil(feishuSecret)) {
                continue
            }
            await persist({
                tenant,
                next: {
                    ...providers,
                    ...(isNil(providers.oidc) || isNil(oidcSecret) ? {} : { oidc: { ...providers.oidc, clientSecret: oidcSecret } }),
                    ...(isNil(providers.feishu) || isNil(feishuSecret) ? {} : { feishu: { ...providers.feishu, appSecret: feishuSecret } }),
                },
            })
            rotated += 1
        }
        return rotated
    },
})

async function rotateSecret(secret: StoredOidcSso['clientSecret'] | undefined) {
    if (isNil(secret) || await encryptUtils.isEncryptedWithCurrentKey(secret)) {
        return null
    }
    return encryptUtils.encryptString(await encryptUtils.decryptString(secret))
}

function hasVerifiedEnabled(providers: FederatedAuthnProviderConfig): boolean {
    const oidcReady = providers.oidc?.enabled === true && !isNil(providers.oidc.verifiedAt)
    const feishuReady = providers.feishu?.enabled === true && !isNil(providers.feishu.verifiedAt)
    return oidcReady || feishuReady
}

async function withTenantLock<T>({ log, tenantId, fn }: WithTenantLockParams<T>): Promise<T> {
    return distributedLock(log).runExclusive({
        key: `sso-settings-${tenantId}`,
        timeoutInSeconds: 30,
        fn,
    })
}

async function persist({ tenant, next }: PersistParams): Promise<void> {
    if (tenant.emailAuthEnabled === false && !hasVerifiedEnabled(next)) {
        throw validation('Password sign-in is off, so at least one verified single sign-on method must stay on')
    }
    await tenantRepo().update({ id: tenant.id }, { federatedAuthProviders: next })
}

async function assertDiscoverable({ issuer }: { issuer: string }): Promise<void> {
    try {
        await oidcClient.discover({ issuer })
    }
    catch (error) {
        if (isSsoLoginError(error)) {
            throw validation(error.detail)
        }
        throw error
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

async function resolveSecret({ provided, previous }: ResolveSecretParams): Promise<StoredOidcSso['clientSecret']> {
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

function changedFields({ previous, next, secretProvided }: ChangedFieldsParams): string[] {
    const keys = Object.keys(next).filter((key) => key !== 'clientSecret' && key !== 'appSecret' && key !== 'verifiedAt' && key !== 'lastLoginAt')
    const before: Record<string, unknown> = isNil(previous) ? {} : { ...previous }
    const after: Record<string, unknown> = { ...next }
    const changed = keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    return secretProvided ? [...changed, 'secret'] : changed
}

function normalizeDomains(domains: string[]): string[] {
    return [...new Set(domains.map((domain) => domain.trim().toLowerCase()).filter((domain) => domain.length > 0))]
}

function ensureOpenid(scopes: string): string {
    const parts = scopes.split(/\s+/).filter((part) => part.length > 0)
    return parts.includes('openid') ? parts.join(' ') : ['openid', ...parts].join(' ')
}

function emptyToNull(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? ''
    return trimmed.length === 0 ? null : trimmed
}

function toOidcSettings(stored: StoredOidcSso): OidcSsoSettings {
    return {
        enabled: stored.enabled,
        displayName: stored.displayName,
        allowedDomains: stored.allowedDomains,
        autoCreateUsers: stored.autoCreateUsers,
        defaultRole: stored.defaultRole,
        roleMapping: stored.roleMapping ?? null,
        defaultProject: stored.defaultProject ?? null,
        verifiedAt: stored.verifiedAt ?? null,
        lastLoginAt: stored.lastLoginAt ?? null,
        issuer: stored.issuer,
        clientId: stored.clientId,
        hasClientSecret: true,
        scopes: stored.scopes,
        emailClaim: stored.emailClaim,
        requireVerifiedEmail: stored.requireVerifiedEmail,
    }
}

function toFeishuSettings(stored: StoredFeishuSso): FeishuSsoSettings {
    return {
        enabled: stored.enabled,
        displayName: stored.displayName,
        allowedDomains: stored.allowedDomains,
        autoCreateUsers: stored.autoCreateUsers,
        defaultRole: stored.defaultRole,
        roleMapping: null,
        defaultProject: stored.defaultProject ?? null,
        verifiedAt: stored.verifiedAt ?? null,
        lastLoginAt: stored.lastLoginAt ?? null,
        appId: stored.appId,
        hasAppSecret: true,
        region: stored.region,
        allowedEnterpriseKey: stored.allowedEnterpriseKey ?? null,
    }
}

function validation(message: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

const SSO_CALLBACK_PATH = '/v1/authn/sso/callback'

export const ssoConfigUtils = {
    hasVerifiedEnabled,
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
    previous: StoredOidcSso['clientSecret'] | null
}

type ChangedFieldsParams = {
    previous: StoredOidcSso | StoredFeishuSso | null
    next: StoredOidcSso | StoredFeishuSso
    secretProvided: boolean
}
