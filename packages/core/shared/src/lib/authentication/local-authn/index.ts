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
