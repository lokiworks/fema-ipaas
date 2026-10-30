import { EntityId } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export const VerifyEmailRequestBody = z.object({
    identityId: EntityId,
    otp: z.string(),
})
export type VerifyEmailRequestBody = z.infer<typeof VerifyEmailRequestBody>

export const ResetPasswordRequestBody = z.object({
    identityId: EntityId,
    otp: z.string(),
    newPassword: z.string(),
})
export type ResetPasswordRequestBody = z.infer<typeof ResetPasswordRequestBody>

export const CheckResetPasswordLinkRequestBody = z.object({
    identityId: z.string().max(64),
    otp: z.string().max(256),
})
export type CheckResetPasswordLinkRequestBody = z.infer<typeof CheckResetPasswordLinkRequestBody>

export const CheckResetPasswordLinkResponse = z.object({
    valid: z.boolean(),
})
export type CheckResetPasswordLinkResponse = z.infer<typeof CheckResetPasswordLinkResponse>
