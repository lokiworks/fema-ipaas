import { DateOrString, EntityId, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { TenantRole } from '../../core/user/user'
import { formErrors } from '../../form-errors'

export enum TenantStatus {
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
}

export enum InstanceRole {
    OPERATOR = 'OPERATOR',
}

export enum TenantMfaPolicy {
    OPTIONAL = 'OPTIONAL',
    REQUIRED = 'REQUIRED',
}

export enum TenantDomainPurpose {
    LOGIN_DISCOVERY = 'LOGIN_DISCOVERY',
    HOST = 'HOST',
}

export enum CaptchaProvider {
    BUILTIN = 'BUILTIN',
    TURNSTILE = 'TURNSTILE',
}

const slug = z.string().trim().toLowerCase().min(3, 'tenantSlugInvalid').max(40, 'tenantSlugInvalid').regex(slugPattern(), 'tenantSlugInvalid')
const domain = z.string().trim().toLowerCase().max(253, 'invalidDomain').regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'invalidDomain')
const nullableLimit = Nullable(z.number().int().min(0))

function slugPattern(): RegExp {
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
}

export const TenantExternalRef = z.object({
    issuer: z.string().min(1).max(500),
    tenantId: z.string().min(1).max(200),
})
export type TenantExternalRef = z.infer<typeof TenantExternalRef>

export const TenantDomainVerificationRecord = z.object({
    type: z.literal('TXT'),
    name: z.string(),
    value: z.string(),
})
export type TenantDomainVerificationRecord = z.infer<typeof TenantDomainVerificationRecord>

export const TenantDomain = z.object({
    id: EntityId,
    created: DateOrString,
    updated: DateOrString,
    tenantId: EntityId,
    domain: z.string(),
    purpose: z.enum(TenantDomainPurpose),
    verificationRecord: TenantDomainVerificationRecord,
    verifiedAt: Nullable(DateOrString),
})
export type TenantDomain = z.infer<typeof TenantDomain>

export const CreateTenantDomainRequestBody = z.object({
    domain,
    purpose: z.enum(TenantDomainPurpose),
})
export type CreateTenantDomainRequestBody = z.infer<typeof CreateTenantDomainRequestBody>

export const PublicSsoEntry = z.object({
    provider: z.string(),
    label: z.string(),
})
export type PublicSsoEntry = z.infer<typeof PublicSsoEntry>

export const PublicTenantInfo = z.object({
    id: EntityId,
    slug: z.string(),
    name: z.string(),
    logoIconUrl: z.string(),
    fullLogoUrl: z.string(),
    primaryColor: z.string(),
    welcomeText: Nullable(z.string()),
    emailAuthEnabled: z.boolean(),
    phoneAuthEnabled: z.boolean(),
    ssoProviders: z.array(PublicSsoEntry),
})
export type PublicTenantInfo = z.infer<typeof PublicTenantInfo>

export const TenantDiscoveryRequestBody = z.object({
    email: z.string().trim().toLowerCase().email('invalidEmail'),
})
export type TenantDiscoveryRequestBody = z.infer<typeof TenantDiscoveryRequestBody>

export const TenantDiscoveryResponse = z.object({
    tenants: z.array(PublicTenantInfo),
})
export type TenantDiscoveryResponse = z.infer<typeof TenantDiscoveryResponse>

export const TenantLimitsUpdate = z.object({
    usersLimit: nullableLimit,
    projectsLimit: nullableLimit,
    activeWorkflowsLimit: nullableLimit,
    concurrentExecutionsLimit: nullableLimit,
    workerGroupId: Nullable(z.string().max(100)),
})
export type TenantLimitsUpdate = z.infer<typeof TenantLimitsUpdate>

export const OperatorTenantSummary = z.object({
    id: EntityId,
    created: DateOrString,
    name: z.string(),
    slug: z.string(),
    status: z.enum(TenantStatus),
    externalRef: Nullable(TenantExternalRef),
    ownerName: z.string(),
    ownerContact: Nullable(z.string()),
    usersCount: z.number(),
    projectsCount: z.number(),
    activeWorkflowsCount: z.number(),
    usersLimit: Nullable(z.number()),
    projectsLimit: Nullable(z.number()),
    activeWorkflowsLimit: Nullable(z.number()),
    concurrentExecutionsLimit: Nullable(z.number()),
    workerGroupId: Nullable(z.string()),
})
export type OperatorTenantSummary = z.infer<typeof OperatorTenantSummary>

export const ListOperatorTenantsRequestQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().max(100).optional(),
    status: z.enum(TenantStatus).optional(),
})
export type ListOperatorTenantsRequestQuery = z.infer<typeof ListOperatorTenantsRequestQuery>

export const TenantOwnerInput = z.object({
    email: z.string().trim().toLowerCase().email('invalidEmail').optional(),
    phone: z.string().trim().regex(phonePattern(), 'invalidPhone').optional(),
    subject: z.string().min(1).max(200).optional(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
}).refine((owner) => owner.email !== undefined || owner.phone !== undefined || owner.subject !== undefined, {
    message: 'tenantOwnerContactRequired',
})
export type TenantOwnerInput = z.infer<typeof TenantOwnerInput>

function phonePattern(): RegExp {
    return /^\+[1-9]\d{6,14}$/
}

export const OperatorCreateTenantRequestBody = z.object({
    name: z.string().trim().min(1, formErrors.required).max(100),
    slug: slug.optional(),
    owner: TenantOwnerInput,
    limits: TenantLimitsUpdate.optional(),
})
export type OperatorCreateTenantRequestBody = z.infer<typeof OperatorCreateTenantRequestBody>

export const OperatorCreateTenantResponse = z.object({
    tenant: OperatorTenantSummary,
    ownerInvitationUrl: Nullable(z.string()),
})
export type OperatorCreateTenantResponse = z.infer<typeof OperatorCreateTenantResponse>

export const UpdateTenantSlugRequestBody = z.object({
    slug,
})
export type UpdateTenantSlugRequestBody = z.infer<typeof UpdateTenantSlugRequestBody>

export const InstanceOperator = z.object({
    identityId: EntityId,
    name: z.string(),
    contact: Nullable(z.string()),
})
export type InstanceOperator = z.infer<typeof InstanceOperator>

export const GrantInstanceOperatorRequestBody = z.object({
    email: z.string().trim().toLowerCase().email('invalidEmail'),
})
export type GrantInstanceOperatorRequestBody = z.infer<typeof GrantInstanceOperatorRequestBody>

export const SmsProviderKind = z.enum(['ALIYUN', 'TENCENT'])
export type SmsProviderKind = z.infer<typeof SmsProviderKind>

export const SmsSettingsPublic = z.object({
    provider: SmsProviderKind,
    accessKeyId: z.string(),
    hasAccessKeySecret: z.boolean(),
    signName: z.string(),
    templateCode: z.string(),
    sdkAppId: Nullable(z.string()),
    region: Nullable(z.string()),
    verifiedAt: Nullable(DateOrString),
})
export type SmsSettingsPublic = z.infer<typeof SmsSettingsPublic>

export const UpdateSmsSettingsRequestBody = z.object({
    provider: SmsProviderKind,
    accessKeyId: z.string().trim().min(1, formErrors.required).max(200),
    accessKeySecret: z.string().min(1, formErrors.required).max(500).optional(),
    signName: z.string().trim().min(1, formErrors.required).max(50),
    templateCode: z.string().trim().min(1, formErrors.required).max(100),
    sdkAppId: Nullable(z.string().trim().max(100)),
    region: Nullable(z.string().trim().max(50)),
})
export type UpdateSmsSettingsRequestBody = z.infer<typeof UpdateSmsSettingsRequestBody>

export const TestSmsSettingsRequestBody = z.object({
    phone: z.string().trim().regex(phonePattern(), 'invalidPhone'),
})
export type TestSmsSettingsRequestBody = z.infer<typeof TestSmsSettingsRequestBody>

export const PlatformLoginAppKind = z.enum(['FEISHU', 'WECOM', 'DINGTALK'])
export type PlatformLoginAppKind = z.infer<typeof PlatformLoginAppKind>

export const PlatformLoginAppPublic = z.object({
    kind: PlatformLoginAppKind,
    enabled: z.boolean(),
    appId: z.string(),
    hasAppSecret: z.boolean(),
    region: Nullable(z.string()),
    allowSelfSignup: z.boolean(),
})
export type PlatformLoginAppPublic = z.infer<typeof PlatformLoginAppPublic>

export const UpdatePlatformLoginAppRequestBody = z.object({
    enabled: z.boolean(),
    appId: z.string().trim().min(1, formErrors.required).max(200),
    appSecret: z.string().min(1, formErrors.required).max(500).optional(),
    region: Nullable(z.string().trim().max(50)),
    allowSelfSignup: z.boolean(),
})
export type UpdatePlatformLoginAppRequestBody = z.infer<typeof UpdatePlatformLoginAppRequestBody>

export const InstanceSettings = z.object({
    tenantSelfSignup: z.boolean(),
    tenantBaseDomain: Nullable(z.string()),
    captchaProvider: z.enum(CaptchaProvider),
    turnstileConfigured: z.boolean(),
    sms: Nullable(SmsSettingsPublic),
    platformLoginApps: z.array(PlatformLoginAppPublic),
})
export type InstanceSettings = z.infer<typeof InstanceSettings>

export const UpdateInstanceSettingsRequestBody = z.object({
    tenantSelfSignup: z.boolean().optional(),
    captchaProvider: z.enum(CaptchaProvider).optional(),
})
export type UpdateInstanceSettingsRequestBody = z.infer<typeof UpdateInstanceSettingsRequestBody>

export const TenantMembershipOption = z.object({
    tenantId: EntityId,
    slug: z.string(),
    name: z.string(),
    logoIconUrl: z.string(),
    role: z.enum(TenantRole),
    status: z.enum(TenantStatus),
})
export type TenantMembershipOption = z.infer<typeof TenantMembershipOption>

export const SAAS_LIMITS = {
    slugPattern: slugPattern(),
    phonePattern: phonePattern(),
    tenantHeader: 'x-fema-tenant',
    tenantQueryParam: 'tenant',
    tenantPathPrefix: '/t/',
    domainVerificationRecordPrefix: '_fema-ipaas-verification',
}
