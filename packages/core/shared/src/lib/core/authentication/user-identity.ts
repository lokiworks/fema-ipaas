import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { InstanceRole } from '../../management/saas/tenancy'


export enum UserIdentityProvider {
    EMAIL = 'EMAIL',
    GOOGLE = 'GOOGLE',
    SAML = 'SAML',
    JWT = 'JWT',
    OIDC = 'OIDC',
    FEISHU = 'FEISHU',
    WECOM = 'WECOM',
    DINGTALK = 'DINGTALK',
    PHONE = 'PHONE',
}
export const UserIdentity = z.object({
    ...BaseModelSchema,
    firstName: z.string(),
    lastName: z.string(),
    email: Nullable(z.string()),
    contactEmail: Nullable(z.string()),
    phone: Nullable(z.string()),
    phoneVerified: z.boolean(),
    mfaEnabled: z.boolean(),
    mfaSecret: Nullable(z.string()),
    mfaRecoveryCodes: Nullable(z.array(z.string())),
    instanceRole: Nullable(z.enum(InstanceRole)),
    password: z.string(),
    trackEvents: z.boolean(),
    newsLetter: z.boolean(),
    verified: z.boolean(),
    tokenVersion: z.string().optional(),
    provider: z.nativeEnum(UserIdentityProvider),
    imageUrl: Nullable(z.string()),
    lastLoggedInTenantId: Nullable(z.string()),
})

export type UserIdentity = z.infer<typeof UserIdentity>
