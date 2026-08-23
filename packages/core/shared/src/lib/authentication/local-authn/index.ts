import { ApId } from '@activepieces/core-utils'
import { z } from 'zod'

export const VerifyEmailRequestBody = z.object({
    identityId: ApId,
    otp: z.string(),
})
export type VerifyEmailRequestBody = z.infer<typeof VerifyEmailRequestBody>

export const ResetPasswordRequestBody = z.object({
    identityId: ApId,
    otp: z.string(),
    newPassword: z.string(),
})
export type ResetPasswordRequestBody = z.infer<typeof ResetPasswordRequestBody>
