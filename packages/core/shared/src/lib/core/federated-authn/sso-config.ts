import { Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { DefaultProjectRole } from '../../management/project/project-member'
import { TenantRole } from '../user/user'

export enum SsoRegion {
    FEISHU = 'FEISHU',
    LARK = 'LARK',
}

export const SSO_ASSIGNABLE_ROLES = [TenantRole.ADMIN, TenantRole.OPERATOR, TenantRole.MEMBER] as const

export const SsoEncryptedSecret = z.object({
    iv: z.string(),
    data: z.string(),
    keyId: z.string().optional(),
})
export type SsoEncryptedSecret = z.infer<typeof SsoEncryptedSecret>

export const SsoRoleRule = z.object({
    value: z.string().trim().min(1, 'required').max(200, 'ssoValueTooLong'),
    role: z.enum(SSO_ASSIGNABLE_ROLES),
})
export type SsoRoleRule = z.infer<typeof SsoRoleRule>

export const SsoRoleMapping = z.object({
    claim: z.string().trim().min(1, 'required').max(100, 'ssoValueTooLong'),
    rules: z.array(SsoRoleRule).max(50, 'ssoTooManyRules'),
    syncOnLogin: z.boolean(),
})
export type SsoRoleMapping = z.infer<typeof SsoRoleMapping>

export const SsoDefaultProject = z.object({
    projectId: z.string().min(1, 'required'),
    role: z.enum(DefaultProjectRole),
})
export type SsoDefaultProject = z.infer<typeof SsoDefaultProject>

const SsoProviderCommon = {
    enabled: z.boolean(),
    displayName: z.string(),
    allowedDomains: z.array(z.string()),
    autoCreateUsers: z.boolean(),
    defaultRole: z.enum(SSO_ASSIGNABLE_ROLES),
    roleMapping: Nullable(SsoRoleMapping),
    defaultProject: Nullable(SsoDefaultProject),
    verifiedAt: Nullable(z.string()),
    lastLoginAt: Nullable(z.string()),
}

export const StoredOidcSso = z.object({
    ...SsoProviderCommon,
    issuer: z.string(),
    clientId: z.string(),
    clientSecret: SsoEncryptedSecret,
    scopes: z.string(),
    emailClaim: z.string(),
    requireVerifiedEmail: z.boolean(),
})
export type StoredOidcSso = z.infer<typeof StoredOidcSso>

export const StoredFeishuSso = z.object({
    ...SsoProviderCommon,
    appId: z.string(),
    appSecret: SsoEncryptedSecret,
    region: z.enum(SsoRegion),
    allowedEnterpriseKey: Nullable(z.string()),
})
export type StoredFeishuSso = z.infer<typeof StoredFeishuSso>
