import { isNil } from '@fema-ipaas/core-utils'
import {
    DingtalkSsoSettings,
    FederatedAuthnProviderConfig,
    FeishuSsoSettings,
    OidcSsoSettings,
    PlatformAppBinding,
    PlatformAppBindingView,
    SamlSsoSettings,
    SsoMatchBy,
    SsoProvider,
    StoredDingtalkSso,
    StoredFeishuSso,
    StoredOidcSso,
    StoredSamlSso,
    StoredWecomSso,
    WecomSsoSettings,
} from '@fema-ipaas/shared'
import { ServiceProviderUrls } from './saml-client'

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
        matchBy: stored.matchBy ?? SsoMatchBy.EMAIL,
        extraAuthParams: stored.extraAuthParams ?? {},
        sessionRecheckMinutes: stored.sessionRecheckMinutes ?? null,
        provisioned: stored.provisioned ?? false,
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

function toWecomSettings(stored: StoredWecomSso): WecomSsoSettings {
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
        corpId: stored.corpId,
        agentId: stored.agentId,
        hasSecret: true,
    }
}

function toDingtalkSettings(stored: StoredDingtalkSso): DingtalkSsoSettings {
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
        appKey: stored.appKey,
        hasAppSecret: true,
        corpId: stored.corpId ?? null,
    }
}

function toSamlSettings({ stored, sp }: { stored: StoredSamlSso, sp: ServiceProviderUrls }): SamlSsoSettings {
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
        idpEntityId: stored.idpEntityId,
        idpSsoUrl: stored.idpSsoUrl,
        certificateCount: stored.idpCertificates.length,
        emailAttribute: stored.emailAttribute,
        firstNameAttribute: stored.firstNameAttribute ?? null,
        lastNameAttribute: stored.lastNameAttribute ?? null,
        subjectSource: stored.subjectSource,
        subjectAttribute: stored.subjectAttribute ?? null,
        signAuthnRequests: stored.signAuthnRequests,
        spEntityId: sp.entityId,
        acsUrl: sp.acsUrl,
        spMetadataUrl: sp.metadataUrl,
    }
}

function toBindingViews(bindings: PlatformAppBinding[] | undefined): PlatformAppBindingView[] {
    return (bindings ?? []).map((binding) => ({
        kind: binding.kind,
        enterpriseKey: binding.enterpriseKey,
        enterpriseName: binding.enterpriseName,
        boundAt: binding.boundAt,
    }))
}

function commonOf({ providers, provider }: { providers: FederatedAuthnProviderConfig, provider: SsoProvider }): ProviderCommon | null {
    switch (provider) {
        case SsoProvider.OIDC:
            return providers.oidc ?? null
        case SsoProvider.FEISHU:
            return providers.feishu ?? null
        case SsoProvider.WECOM:
            return providers.wecom ?? null
        case SsoProvider.DINGTALK:
            return providers.dingtalk ?? null
        case SsoProvider.SAML:
            return providers.saml2 ?? null
    }
}

function patchProvider({ providers, provider, patch }: { providers: FederatedAuthnProviderConfig, provider: SsoProvider, patch: ProviderPatch }): FederatedAuthnProviderConfig {
    switch (provider) {
        case SsoProvider.OIDC:
            return isNil(providers.oidc) ? providers : { ...providers, oidc: { ...providers.oidc, ...patch } }
        case SsoProvider.FEISHU:
            return isNil(providers.feishu) ? providers : { ...providers, feishu: { ...providers.feishu, ...patch } }
        case SsoProvider.WECOM:
            return isNil(providers.wecom) ? providers : { ...providers, wecom: { ...providers.wecom, ...patch } }
        case SsoProvider.DINGTALK:
            return isNil(providers.dingtalk) ? providers : { ...providers, dingtalk: { ...providers.dingtalk, ...patch } }
        case SsoProvider.SAML:
            return isNil(providers.saml2) ? providers : { ...providers, saml2: { ...providers.saml2, ...patch } }
    }
}

function hasVerifiedEnabled(providers: FederatedAuthnProviderConfig): boolean {
    return Object.values(SsoProvider).some((provider) => {
        const stored = commonOf({ providers, provider })
        return stored?.enabled === true && !isNil(stored.verifiedAt)
    })
}

export const ssoSettingsView = {
    toOidcSettings,
    toFeishuSettings,
    toWecomSettings,
    toDingtalkSettings,
    toSamlSettings,
    toBindingViews,
    commonOf,
    patchProvider,
    hasVerifiedEnabled,
}

export type ProviderCommon = {
    enabled: boolean
    displayName: string
    verifiedAt?: string | null
    lastLoginAt?: string | null
}

export type ProviderPatch = {
    enabled?: boolean
    verifiedAt?: string | null
    lastLoginAt?: string | null
}
