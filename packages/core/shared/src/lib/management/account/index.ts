import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum PersonalAccessTokenExpiry {
    DAYS_30 = 'DAYS_30',
    DAYS_90 = 'DAYS_90',
    DAYS_365 = 'DAYS_365',
    NEVER = 'NEVER',
}

export const PersonalAccessToken = z.object({
    ...BaseModelSchema,
    name: z.string(),
    tokenHint: z.string(),
    expiresAt: Nullable(z.string()),
    lastUsedAt: Nullable(z.string()),
})
export type PersonalAccessToken = z.infer<typeof PersonalAccessToken>

export const CreatePersonalAccessTokenRequestBody = z.object({
    name: z.string().trim().min(1, 'formErrors.required').max(30, 'accessTokenNameTooLong'),
    expiry: z.enum(PersonalAccessTokenExpiry),
})
export type CreatePersonalAccessTokenRequestBody = z.infer<typeof CreatePersonalAccessTokenRequestBody>

export const CreatePersonalAccessTokenResponse = z.object({
    token: PersonalAccessToken,
    value: z.string(),
})
export type CreatePersonalAccessTokenResponse = z.infer<typeof CreatePersonalAccessTokenResponse>

export const UpdateProfileRequestBody = z.object({
    name: z.string().trim().min(1, 'formErrors.required').max(20, 'accountNameTooLong'),
})
export type UpdateProfileRequestBody = z.infer<typeof UpdateProfileRequestBody>

export const PERSONAL_ACCESS_TOKEN_PREFIX = 'pat_'
export const PERSONAL_ACCESS_TOKEN_SECRET_LENGTH = 32
export const PERSONAL_ACCESS_TOKEN_MAX_PER_USER = 20

export const PERSONAL_ACCESS_TOKEN_EXPIRY_DAYS: Record<PersonalAccessTokenExpiry, number | null> = {
    [PersonalAccessTokenExpiry.DAYS_30]: 30,
    [PersonalAccessTokenExpiry.DAYS_90]: 90,
    [PersonalAccessTokenExpiry.DAYS_365]: 365,
    [PersonalAccessTokenExpiry.NEVER]: null,
}
