import { BaseModelSchema, DateOrString, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum TenantRole {
    /**
     * Tenant administrator with full control over tenant settings,
     * users, and all projects
     */
    ADMIN = 'ADMIN',
    /**
     * Regular tenant member with access only to projects they are
     * explicitly invited to
     */
    MEMBER = 'MEMBER',
    /**
     * Tenant operator with automatic access to all projects without editior permission, except (others' private projects) in the
     * tenant but no tenant administration capabilities
     */
    OPERATOR = 'OPERATOR',
}

export enum UserStatus {
    /* user is active */
    ACTIVE = 'ACTIVE',
    /* user account deactivated */
    INACTIVE = 'INACTIVE',
}

export const EmailType = z.string().email()

export const PasswordType = z.string().min(8).max(64)

export const User = z.object({
    ...BaseModelSchema,
    tenantRole: z.nativeEnum(TenantRole),
    status: z.nativeEnum(UserStatus),
    identityId: z.string(),
    externalId: Nullable(z.string()),
    tenantId: Nullable(z.string()),
    lastActiveDate: Nullable(DateOrString),
})

export type User = z.infer<typeof User>

export const UserWithMetaInformation = z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string(),
    status: z.enum(UserStatus),
    externalId: Nullable(z.string()),
    tenantId: Nullable(z.string()),
    tenantRole: z.enum(TenantRole),
    lastName: z.string(),
    created: DateOrString,
    updated: DateOrString,
    lastActiveDate: Nullable(DateOrString),
    imageUrl: Nullable(z.string()),
})

export type UserWithMetaInformation = z.infer<typeof UserWithMetaInformation>

export const FEMA_MAXIMUM_PROFILE_PICTURE_SIZE = 5 * 1024 * 1024 // 5 MB

export const PROFILE_PICTURE_ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]

export const UpdateMeRequestBody = z.object({
    profilePicture: z.any().optional(),
})

export type UpdateMeRequestBody = z.infer<typeof UpdateMeRequestBody>

export const UpdateMeResponse = z.object({
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    trackEvents: z.boolean(),
    newsLetter: z.boolean(),
    imageUrl: Nullable(z.string()),
})

export type UpdateMeResponse = z.infer<typeof UpdateMeResponse>
