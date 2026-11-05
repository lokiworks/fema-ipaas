import { z } from 'zod'
import { EmailType, PasswordType } from '../../user/user'
import { MAX_CAPTCHA_TOKEN_LENGTH } from './passwordless-request'

export const SignInRequest = z.object({
    email: EmailType,
    password: PasswordType,
    captchaToken: z.string().trim().min(1).max(MAX_CAPTCHA_TOKEN_LENGTH).optional(),
})

export type SignInRequest = z.infer<typeof SignInRequest>
