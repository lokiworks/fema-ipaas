import { DateOrString, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { SSO_ASSIGNABLE_ROLES, SsoDefaultProject, SsoRegion, SsoRoleMapping } from '../../core/federated-authn/sso-config'
import { formErrors } from '../../form-errors'

export enum SsoProvider {
    OIDC = 'OIDC',
    FEISHU = 'FEISHU',
}

export enum SsoLoginErrorCode {
    PROVIDER_NOT_ENABLED = 'PROVIDER_NOT_ENABLED',
    STATE_INVALID = 'STATE_INVALID',
    STATE_REPLAYED = 'STATE_REPLAYED',
    BROWSER_MISMATCH = 'BROWSER_MISMATCH',
    IDP_DENIED = 'IDP_DENIED',
    CLIENT_REJECTED = 'CLIENT_REJECTED',
    CODE_REJECTED = 'CODE_REJECTED',
    TOKEN_INVALID = 'TOKEN_INVALID',
    ISSUER_MISMATCH = 'ISSUER_MISMATCH',
    EMAIL_MISSING = 'EMAIL_MISSING',
    EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
    DOMAIN_NOT_ALLOWED = 'DOMAIN_NOT_ALLOWED',
    USER_NOT_PROVISIONED = 'USER_NOT_PROVISIONED',
    USER_DISABLED = 'USER_DISABLED',
    ENTERPRISE_MISMATCH = 'ENTERPRISE_MISMATCH',
    PROVIDER_UNREACHABLE = 'PROVIDER_UNREACHABLE',
    TEST_ACCOUNT_MISMATCH = 'TEST_ACCOUNT_MISMATCH',
    TICKET_INVALID = 'TICKET_INVALID',
    UNKNOWN = 'UNKNOWN',
}

const ssoUrl = z.string().trim().max(500, 'urlTooLong').regex(/^https?:\/\/\S+$/, 'invalidHttpUrl')
const ssoDomain = z.string().trim().toLowerCase().max(253, 'ssoValueTooLong').regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'invalidDomain')

const SsoSettingsCommon = {
    enabled: z.boolean(),
    displayName: z.string(),
    allowedDomains: z.array(z.string()),
    autoCreateUsers: z.boolean(),
    defaultRole: z.enum(SSO_ASSIGNABLE_ROLES),
    roleMapping: Nullable(SsoRoleMapping),
    defaultProject: Nullable(SsoDefaultProject),
    verifiedAt: Nullable(DateOrString),
    lastLoginAt: Nullable(DateOrString),
}

export const OidcSsoSettings = z.object({
    ...SsoSettingsCommon,
    issuer: z.string(),
    clientId: z.string(),
    hasClientSecret: z.boolean(),
    scopes: z.string(),
    emailClaim: z.string(),
    requireVerifiedEmail: z.boolean(),
})
export type OidcSsoSettings = z.infer<typeof OidcSsoSettings>

export const FeishuSsoSettings = z.object({
    ...SsoSettingsCommon,
    appId: z.string(),
    hasAppSecret: z.boolean(),
    region: z.enum(SsoRegion),
    allowedEnterpriseKey: Nullable(z.string()),
})
export type FeishuSsoSettings = z.infer<typeof FeishuSsoSettings>

export const SsoSettings = z.object({
    oidc: Nullable(OidcSsoSettings),
    feishu: Nullable(FeishuSsoSettings),
    redirectUri: z.string(),
})
export type SsoSettings = z.infer<typeof SsoSettings>

const SsoUpdateCommon = {
    enabled: z.boolean(),
    displayName: z.string().trim().max(20, 'ssoDisplayNameTooLong'),
    allowedDomains: z.array(ssoDomain).max(50, 'ssoTooManyRules'),
    autoCreateUsers: z.boolean(),
    defaultRole: z.enum(SSO_ASSIGNABLE_ROLES),
    roleMapping: Nullable(SsoRoleMapping),
    defaultProject: Nullable(SsoDefaultProject),
}

export const UpdateOidcSsoRequestBody = z.object({
    ...SsoUpdateCommon,
    issuer: ssoUrl,
    clientId: z.string().trim().min(1, formErrors.required).max(300, 'ssoValueTooLong'),
    clientSecret: z.string().min(1, formErrors.required).max(2000, 'ssoValueTooLong').optional(),
    scopes: z.string().trim().min(1, formErrors.required).max(300, 'ssoValueTooLong'),
    emailClaim: z.string().trim().min(1, formErrors.required).max(100, 'ssoValueTooLong'),
    requireVerifiedEmail: z.boolean(),
})
export type UpdateOidcSsoRequestBody = z.infer<typeof UpdateOidcSsoRequestBody>

export const UpdateFeishuSsoRequestBody = z.object({
    ...SsoUpdateCommon,
    appId: z.string().trim().min(1, formErrors.required).max(300, 'ssoValueTooLong'),
    appSecret: z.string().min(1, formErrors.required).max(2000, 'ssoValueTooLong').optional(),
    region: z.enum(SsoRegion),
    allowedEnterpriseKey: Nullable(z.string().trim().max(100, 'ssoValueTooLong')),
})
export type UpdateFeishuSsoRequestBody = z.infer<typeof UpdateFeishuSsoRequestBody>

export const SsoProviderOption = z.object({
    provider: z.enum(SsoProvider),
    label: z.string(),
})
export type SsoProviderOption = z.infer<typeof SsoProviderOption>

export const SsoPublicProvidersResponse = z.object({
    providers: z.array(SsoProviderOption),
})
export type SsoPublicProvidersResponse = z.infer<typeof SsoPublicProvidersResponse>

export const SsoStartQuery = z.object({
    provider: z.enum(SsoProvider),
})
export type SsoStartQuery = z.infer<typeof SsoStartQuery>

export const SsoCallbackQuery = z.object({
    code: z.string().max(4000).optional(),
    state: z.string().max(500).optional(),
    error: z.string().max(200).optional(),
    error_description: z.string().max(1000).optional(),
})
export type SsoCallbackQuery = z.infer<typeof SsoCallbackQuery>

export const SsoExchangeRequestBody = z.object({
    ticket: z.string().min(1).max(200),
})
export type SsoExchangeRequestBody = z.infer<typeof SsoExchangeRequestBody>

export const SsoTestStartResponse = z.object({
    url: z.string(),
})
export type SsoTestStartResponse = z.infer<typeof SsoTestStartResponse>

export const SSO_LIMITS = {
    stateTtlSeconds: 600,
    ticketTtlSeconds: 60,
    defaultScopes: 'openid email profile',
    defaultEmailClaim: 'email',
    defaultRoleClaim: 'groups',
}
