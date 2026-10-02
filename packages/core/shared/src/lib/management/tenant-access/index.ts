import { BaseModelSchema, DateOrString, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { TenantRole } from '../../core/user/user'
import { formErrors } from '../../form-errors'

export enum TenantModule {
    BUSINESS_INTEGRATION = 'BUSINESS_INTEGRATION',
    CONNECTOR_DEVELOPMENT = 'CONNECTOR_DEVELOPMENT',
    MCP_SERVICES = 'MCP_SERVICES',
    PLATFORM_ADMIN = 'PLATFORM_ADMIN',
}

export enum TenantMemberStatus {
    ACTIVE = 'ACTIVE',
    PENDING = 'PENDING',
    DISABLED = 'DISABLED',
}

export enum PermissionDeniedHint {
    ADMINS = 'ADMINS',
    PERSON = 'PERSON',
    URL = 'URL',
    APPLY = 'APPLY',
}

export enum ModuleAccessRequestStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
}

export enum OwnedResourceType {
    WORKFLOW = 'WORKFLOW',
    CONNECTION = 'CONNECTION',
    MCP_SERVICE = 'MCP_SERVICE',
    DATA_STORE = 'DATA_STORE',
    PROJECT = 'PROJECT',
}

export enum LoginMethod {
    EMAIL_PASSWORD = 'EMAIL_PASSWORD',
    OIDC = 'OIDC',
    SAML = 'SAML',
    FEISHU = 'FEISHU',
    WECOM = 'WECOM',
    DINGTALK = 'DINGTALK',
}

const MAX_USERS_PER_BATCH = 10
const PASSWORD_MIN_LENGTH_FLOOR = 8
const PASSWORD_MIN_LENGTH_CEILING = 64

const httpUrl = z.string().max(500, 'urlTooLong').regex(/^https?:\/\/\S+\.\S+/, 'invalidHttpUrl')

export const ModuleAccessSettings = z.object({
    deniedHint: z.enum(PermissionDeniedHint),
    personUserId: Nullable(z.string()),
    url: Nullable(httpUrl),
    allowRequests: z.boolean(),
    notice: z.string().max(200, 'moduleNoticeTooLong'),
    rulesUrl: Nullable(httpUrl),
})
export type ModuleAccessSettings = z.infer<typeof ModuleAccessSettings>

export const UpdateModuleAccessSettingsRequestBody = ModuleAccessSettings.superRefine((value, ctx) => {
    if (value.deniedHint === PermissionDeniedHint.PERSON && !value.personUserId) {
        ctx.addIssue({ code: 'custom', path: ['personUserId'], message: 'selectPersonToShow' })
    }
    if (value.deniedHint === PermissionDeniedHint.URL && !value.url) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: 'invalidHttpUrl' })
    }
    if (value.deniedHint === PermissionDeniedHint.APPLY && !value.allowRequests) {
        ctx.addIssue({ code: 'custom', path: ['deniedHint'], message: 'applyHintNeedsRequests' })
    }
})
export type UpdateModuleAccessSettingsRequestBody = z.infer<typeof UpdateModuleAccessSettingsRequestBody>

export const TenantMember = z.object({
    id: z.string(),
    kind: z.enum(['USER', 'INVITATION']),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    status: z.enum(TenantMemberStatus),
    tenantRole: z.enum(TenantRole),
    isOwner: z.boolean(),
    modules: z.array(z.enum(TenantModule)),
    external: z.boolean(),
    lastActiveDate: Nullable(DateOrString),
    created: DateOrString,
})
export type TenantMember = z.infer<typeof TenantMember>

export const ListTenantMembersResponse = z.object({
    members: z.array(TenantMember),
    homeDomains: z.array(z.string()),
    emailAuthEnabled: z.boolean(),
    emailDelivery: z.boolean(),
})
export type ListTenantMembersResponse = z.infer<typeof ListTenantMembersResponse>

export const AddTenantUsersRequestBody = z.object({
    emails: z.array(z.string().trim().toLowerCase().email('invalidEmail')).min(1, formErrors.required).max(MAX_USERS_PER_BATCH, 'atMostTenUsers'),
    tenantRole: z.enum([TenantRole.ADMIN, TenantRole.MEMBER, TenantRole.OPERATOR]),
    modules: z.array(z.enum(TenantModule)),
})
export type AddTenantUsersRequestBody = z.infer<typeof AddTenantUsersRequestBody>

export const AddTenantUsersResponse = z.object({
    invited: z.array(z.object({
        email: z.string(),
        link: Nullable(z.string()),
        external: z.boolean(),
    })),
    emailSent: z.boolean(),
})
export type AddTenantUsersResponse = z.infer<typeof AddTenantUsersResponse>

export const UpdateTenantMemberAccessRequestBody = z.object({
    tenantRole: z.enum(TenantRole).optional(),
    modules: z.array(z.enum(TenantModule)).optional(),
})
export type UpdateTenantMemberAccessRequestBody = z.infer<typeof UpdateTenantMemberAccessRequestBody>

export const ResetMemberPasswordResponse = z.object({
    temporaryPassword: z.string(),
})
export type ResetMemberPasswordResponse = z.infer<typeof ResetMemberPasswordResponse>

export const RemoveTenantMemberRequestQuery = z.object({
    transferToUserId: z.string().optional(),
})
export type RemoveTenantMemberRequestQuery = z.infer<typeof RemoveTenantMemberRequestQuery>

export const OwnedResource = z.object({
    type: z.enum(OwnedResourceType),
    id: z.string(),
    name: z.string(),
    scope: Nullable(z.string()),
    ownerId: z.string(),
    updated: DateOrString,
})
export type OwnedResource = z.infer<typeof OwnedResource>

export const ListOwnedResourcesRequestQuery = z.object({
    type: z.enum(OwnedResourceType).optional(),
    ownerId: z.string().optional(),
    search: z.string().optional(),
})
export type ListOwnedResourcesRequestQuery = z.infer<typeof ListOwnedResourcesRequestQuery>

export const ListOwnedResourcesResponse = z.object({
    resources: z.array(OwnedResource),
    truncated: z.boolean(),
})
export type ListOwnedResourcesResponse = z.infer<typeof ListOwnedResourcesResponse>

export const TransferResourcesRequestBody = z.object({
    resources: z.array(z.object({
        type: z.enum(OwnedResourceType),
        id: z.string(),
    })).min(1, formErrors.required).max(500),
    toUserId: z.string().min(1, formErrors.required),
})
export type TransferResourcesRequestBody = z.infer<typeof TransferResourcesRequestBody>

export const TransferResourcesResponse = z.object({
    transferred: z.number(),
    skipped: z.number(),
})
export type TransferResourcesResponse = z.infer<typeof TransferResourcesResponse>

export const ModuleAccessRequest = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    userId: z.string(),
    module: z.enum(TenantModule),
    reason: z.string(),
    status: z.enum(ModuleAccessRequestStatus),
    decidedBy: Nullable(z.string()),
    decidedAt: Nullable(DateOrString),
})
export type ModuleAccessRequest = z.infer<typeof ModuleAccessRequest>

export const ModuleAccessRequestWithUsers = ModuleAccessRequest.extend({
    userEmail: Nullable(z.string()),
    userName: Nullable(z.string()),
    decidedByName: Nullable(z.string()),
})
export type ModuleAccessRequestWithUsers = z.infer<typeof ModuleAccessRequestWithUsers>

export const ListModuleAccessRequestsQuery = z.object({
    status: z.enum(ModuleAccessRequestStatus).optional(),
})
export type ListModuleAccessRequestsQuery = z.infer<typeof ListModuleAccessRequestsQuery>

export const CreateModuleAccessRequestBody = z.object({
    module: z.enum([TenantModule.CONNECTOR_DEVELOPMENT, TenantModule.MCP_SERVICES, TenantModule.PLATFORM_ADMIN]),
    reason: z.string().trim().max(200, 'moduleNoticeTooLong'),
})
export type CreateModuleAccessRequestBody = z.infer<typeof CreateModuleAccessRequestBody>

export const ModuleAccessContact = z.object({
    name: z.string(),
    email: z.string(),
})
export type ModuleAccessContact = z.infer<typeof ModuleAccessContact>

export const MyModuleAccess = z.object({
    modules: z.array(z.enum(TenantModule)),
    pendingModules: z.array(z.enum(TenantModule)),
    deniedHint: z.enum(PermissionDeniedHint),
    contacts: z.array(ModuleAccessContact),
    url: Nullable(z.string()),
    allowRequests: z.boolean(),
    notice: z.string(),
    rulesUrl: Nullable(z.string()),
})
export type MyModuleAccess = z.infer<typeof MyModuleAccess>

export const LoginMethodStatus = z.object({
    method: z.enum(LoginMethod),
    available: z.boolean(),
    configured: z.boolean(),
    enabled: z.boolean(),
})
export type LoginMethodStatus = z.infer<typeof LoginMethodStatus>

export const LoginSecuritySettings = z.object({
    methods: z.array(LoginMethodStatus),
    passwordMinLength: z.number(),
    sessionDurationDays: z.number(),
    emailDelivery: z.boolean(),
})
export type LoginSecuritySettings = z.infer<typeof LoginSecuritySettings>

export const UpdateLoginSecurityRequestBody = z.object({
    emailAuthEnabled: z.boolean().optional(),
    passwordMinLength: z.number().int().min(PASSWORD_MIN_LENGTH_FLOOR, 'passwordMinLengthRange').max(PASSWORD_MIN_LENGTH_CEILING, 'passwordMinLengthRange').optional(),
    sessionDurationDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).optional(),
})
export type UpdateLoginSecurityRequestBody = z.infer<typeof UpdateLoginSecurityRequestBody>

export const TENANT_ACCESS_LIMITS = {
    maxUsersPerBatch: MAX_USERS_PER_BATCH,
    passwordMinLengthFloor: PASSWORD_MIN_LENGTH_FLOOR,
    passwordMinLengthCeiling: PASSWORD_MIN_LENGTH_CEILING,
    defaultPasswordMinLength: 10,
    defaultSessionDurationDays: 7,
    sessionDurationOptions: [1, 7, 30],
    temporaryPasswordLength: 12,
    auditRetentionDays: 90,
}

export const LOGIN_METHOD_ORDER: LoginMethod[] = [
    LoginMethod.EMAIL_PASSWORD,
    LoginMethod.OIDC,
    LoginMethod.SAML,
    LoginMethod.FEISHU,
    LoginMethod.WECOM,
    LoginMethod.DINGTALK,
]

export const ASSIGNABLE_TENANT_MODULES: TenantModule[] = [
    TenantModule.CONNECTOR_DEVELOPMENT,
    TenantModule.MCP_SERVICES,
]

export const DEFAULT_MODULE_ACCESS_SETTINGS: ModuleAccessSettings = {
    deniedHint: PermissionDeniedHint.ADMINS,
    personUserId: null,
    url: null,
    allowRequests: true,
    notice: '',
    rulesUrl: null,
}

export const TENANT_BRANDING_LIMITS = {
    productNameMaxLength: 20,
    welcomeTextMaxLength: 30,
    logoMaxBytes: 256 * 1024,
}
export * from './worker-nodes'
export * from './encryption-status'
export * from './component-health'
