import { Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { formErrors } from '../../form-errors'
import { CaptchaProvider, TenantMembershipOption, TenantMfaPolicy } from './tenancy'

const phone = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'invalidPhone')
const captchaToken = z.string().trim().min(1).max(4000).optional()
const otpCode = z.string().trim().regex(/^\d{6}$/, 'invalidVerificationCode')

export const CaptchaChallenge = z.object({
    algorithm: z.literal('SHA-256'),
    challenge: z.string(),
    salt: z.string(),
    maxNumber: z.number(),
    signature: z.string(),
})
export type CaptchaChallenge = z.infer<typeof CaptchaChallenge>

export const CaptchaSolution = z.object({
    algorithm: z.literal('SHA-256'),
    challenge: z.string(),
    salt: z.string(),
    number: z.number(),
    signature: z.string(),
})
export type CaptchaSolution = z.infer<typeof CaptchaSolution>

export const RequestSmsCodeRequest = z.object({
    phone,
    captchaToken,
})
export type RequestSmsCodeRequest = z.infer<typeof RequestSmsCodeRequest>

export const VerifySmsCodeRequest = z.object({
    phone,
    code: otpCode,
})
export type VerifySmsCodeRequest = z.infer<typeof VerifySmsCodeRequest>

export const RequestPhoneBindingRequest = z.object({
    phone,
    captchaToken,
})
export type RequestPhoneBindingRequest = z.infer<typeof RequestPhoneBindingRequest>

export const ConfirmPhoneBindingRequest = z.object({
    phone,
    code: otpCode,
})
export type ConfirmPhoneBindingRequest = z.infer<typeof ConfirmPhoneBindingRequest>

export const MfaVerifyRequest = z.object({
    challengeToken: z.string().min(1).max(2000),
    code: z.string().trim().min(6, formErrors.required).max(20),
})
export type MfaVerifyRequest = z.infer<typeof MfaVerifyRequest>

export const MfaEnrollStartRequest = z.object({
    challengeToken: z.string().min(1).max(2000).optional(),
})
export type MfaEnrollStartRequest = z.infer<typeof MfaEnrollStartRequest>

export const MfaEnrollStartResponse = z.object({
    secret: z.string(),
    otpauthUrl: z.string(),
})
export type MfaEnrollStartResponse = z.infer<typeof MfaEnrollStartResponse>

export const MfaEnrollConfirmRequest = z.object({
    challengeToken: z.string().min(1).max(2000).optional(),
    code: otpCode,
})
export type MfaEnrollConfirmRequest = z.infer<typeof MfaEnrollConfirmRequest>

export const MfaEnrollConfirmResponse = z.object({
    recoveryCodes: z.array(z.string()),
    authentication: Nullable(z.record(z.string(), z.unknown())),
})
export type MfaEnrollConfirmResponse = z.infer<typeof MfaEnrollConfirmResponse>

export const MfaDisableRequest = z.object({
    code: z.string().trim().min(6, formErrors.required).max(20),
})
export type MfaDisableRequest = z.infer<typeof MfaDisableRequest>

export const AccountSecurityStatus = z.object({
    email: Nullable(z.string()),
    emailVerified: z.boolean(),
    phone: Nullable(z.string()),
    phoneVerified: z.boolean(),
    mfaEnabled: z.boolean(),
    mfaRequiredByTenant: z.boolean(),
    recoveryCodesRemaining: z.number(),
    externalLogins: z.array(z.object({
        issuer: z.string(),
        label: z.string(),
    })),
})
export type AccountSecurityStatus = z.infer<typeof AccountSecurityStatus>

export const UpdateTenantMfaPolicyRequestBody = z.object({
    mfaPolicy: z.enum(TenantMfaPolicy),
    phoneAuthEnabled: z.boolean().optional(),
})
export type UpdateTenantMfaPolicyRequestBody = z.infer<typeof UpdateTenantMfaPolicyRequestBody>

export const SelectTenantRequest = z.object({
    selectionToken: z.string().min(1).max(2000),
    tenantId: z.string().min(1).max(21),
})
export type SelectTenantRequest = z.infer<typeof SelectTenantRequest>

export const TenantSelectionOptionsRequest = z.object({
    selectionToken: z.string().min(1).max(2000),
})
export type TenantSelectionOptionsRequest = z.infer<typeof TenantSelectionOptionsRequest>

export const TenantSelectionOptionsResponse = z.object({
    tenants: z.array(TenantMembershipOption),
})
export type TenantSelectionOptionsResponse = z.infer<typeof TenantSelectionOptionsResponse>

export const CaptchaConfig = z.object({
    provider: z.enum(CaptchaProvider),
})
export type CaptchaConfig = z.infer<typeof CaptchaConfig>

export const LOGIN_METHOD_LIMITS = {
    smsCodeTtlSeconds: 300,
    smsResendSeconds: 60,
    smsDailyLimitPerPhone: 10,
    mfaChallengeTtlSeconds: 300,
    recoveryCodeCount: 10,
    captchaMaxNumber: 100000,
    captchaTtlSeconds: 300,
    totpIssuerFallback: 'iPaaS',
    mfaMaxChallengeAttempts: 5,
    mfaIdentityFailureBudget: 10,
    loginFailuresBeforeCaptcha: 5,
    selectionTokenTtlSeconds: 60,
}
