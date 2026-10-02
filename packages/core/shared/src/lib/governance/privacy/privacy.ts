import { BaseModelSchema, BuiltinMaskDetector, MaskRuleType, PayloadLevel } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum RawViewRole {
    OWNER = 'OWNER',
    ADMIN = 'ADMIN',
    MEMBER = 'MEMBER',
}

export enum ErasureSubjectKind {
    EMPLOYEE_ID = 'EMPLOYEE_ID',
    EMAIL = 'EMAIL',
    PHONE = 'PHONE',
}

export enum ErasureStatus {
    SCANNING = 'SCANNING',
    AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
    ERASING = 'ERASING',
    DONE = 'DONE',
    CANCELED = 'CANCELED',
    FAILED = 'FAILED',
}

export const LOG_RETENTION_DAYS_OPTIONS = [7, 14, 30, 90, 180] as const
export const RAW_PAYLOAD_RETENTION_DAYS_OPTIONS = [1, 3, 7] as const

export const MaskRuleSchema = z.object({
    id: z.string(),
    name: z.string().trim().min(1, 'formErrors.required').max(20, 'maskRuleNameTooLong'),
    type: z.enum(MaskRuleType),
    detector: z.enum(BuiltinMaskDetector).nullable(),
    pattern: z.string().nullable(),
    enabled: z.boolean(),
})

export const PrivacySettings = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    logRetentionDays: z.number().int(),
    payloadLevel: z.enum(PayloadLevel),
    rawPayloadRetentionDays: z.number().int(),
    maskRules: z.array(MaskRuleSchema),
    rawViewRoles: z.array(z.enum(RawViewRole)),
    requireRawViewReason: z.boolean(),
})
export type PrivacySettings = z.infer<typeof PrivacySettings>

export const UpdatePrivacySettingsRequestBody = z.object({
    logRetentionDays: z.number().int().refine(isLogRetentionOption, 'invalidRetentionDays'),
    payloadLevel: z.enum(PayloadLevel),
    rawPayloadRetentionDays: z.number().int().refine(isRawRetentionOption, 'invalidRetentionDays'),
    maskRules: z.array(MaskRuleSchema).max(50, 'maskRulesTooMany'),
    rawViewRoles: z.array(z.enum(RawViewRole)).min(1, 'rawViewRolesRequired'),
    requireRawViewReason: z.boolean(),
}).superRefine((body, ctx) => {
    if (body.rawPayloadRetentionDays > body.logRetentionDays) {
        ctx.addIssue({ code: 'custom', path: ['rawPayloadRetentionDays'], message: 'rawRetentionLongerThanLogs' })
    }
    body.maskRules.forEach((rule, index) => {
        if (rule.type === MaskRuleType.FIELD && !isSafeFieldPattern(rule.pattern)) {
            ctx.addIssue({ code: 'custom', path: ['maskRules', index, 'pattern'], message: 'invalidMaskPattern' })
        }
    })
})
export type UpdatePrivacySettingsRequestBody = z.infer<typeof UpdatePrivacySettingsRequestBody>

export const RevealExecutionPayloadRequestBody = z.object({
    stepName: z.string(),
    reason: z.string().trim().min(4, 'revealReasonTooShort').max(200, 'revealReasonTooLong').optional(),
})
export type RevealExecutionPayloadRequestBody = z.infer<typeof RevealExecutionPayloadRequestBody>

export const RevealExecutionPayloadResponse = z.object({
    stepName: z.string(),
    input: z.unknown(),
    output: z.unknown(),
})
export type RevealExecutionPayloadResponse = z.infer<typeof RevealExecutionPayloadResponse>

export const ErasureMatchedWorkflow = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    count: z.number(),
})
export type ErasureMatchedWorkflow = z.infer<typeof ErasureMatchedWorkflow>

export const DataErasureRequest = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    kind: z.enum(ErasureSubjectKind),
    valueHint: z.string(),
    subjectHint: z.string().nullable(),
    reason: z.string(),
    requestedById: z.string(),
    status: z.enum(ErasureStatus),
    scannedRuns: z.number(),
    matchedRuns: z.number(),
    erasedRuns: z.number(),
    matchedWorkflows: z.array(ErasureMatchedWorkflow),
    firstMatchAt: z.string().nullable(),
    lastMatchAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    error: z.string().nullable(),
})
export type DataErasureRequest = z.infer<typeof DataErasureRequest>

export const CreateDataErasureRequestBody = z.object({
    kind: z.enum(ErasureSubjectKind),
    value: z.string().trim().min(1, 'formErrors.required').max(100, 'erasureValueTooLong'),
    subjectName: z.string().trim().max(20, 'erasureSubjectNameTooLong').optional(),
    reason: z.string().trim().min(1, 'erasureReasonRequired').max(100, 'erasureReasonTooLong'),
}).superRefine((body, ctx) => {
    if (!ERASURE_VALUE_PATTERNS[body.kind].test(body.value)) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: ERASURE_VALUE_ERRORS[body.kind] })
    }
})
export type CreateDataErasureRequestBody = z.infer<typeof CreateDataErasureRequestBody>

export const UpdateProjectRetentionRequestBody = z.object({
    logRetentionDays: z.number().int().min(1).nullable(),
})
export type UpdateProjectRetentionRequestBody = z.infer<typeof UpdateProjectRetentionRequestBody>

function isLogRetentionOption(value: number): boolean {
    return LOG_RETENTION_DAYS_OPTIONS.some((option) => option === value)
}

function isRawRetentionOption(value: number): boolean {
    return RAW_PAYLOAD_RETENTION_DAYS_OPTIONS.some((option) => option === value)
}

function isSafeFieldPattern(pattern: string | null): boolean {
    if (pattern === null || pattern.trim().length === 0) {
        return false
    }
    try {
        const regex = new RegExp(pattern, 'i')
        return !regex.test('') && !MATCH_EVERYTHING_PROBES.every((probe) => regex.test(probe))
    }
    catch {
        return false
    }
}

const ERASURE_VALUE_PATTERNS: Record<ErasureSubjectKind, RegExp> = {
    [ErasureSubjectKind.EMPLOYEE_ID]: /^[A-Za-z0-9_-]{3,40}$/,
    [ErasureSubjectKind.EMAIL]: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
    [ErasureSubjectKind.PHONE]: /^1\d{10}$/,
}

const ERASURE_VALUE_ERRORS: Record<ErasureSubjectKind, string> = {
    [ErasureSubjectKind.EMPLOYEE_ID]: 'erasureEmployeeIdInvalid',
    [ErasureSubjectKind.EMAIL]: 'erasureEmailInvalid',
    [ErasureSubjectKind.PHONE]: 'erasurePhoneInvalid',
}

const MATCH_EVERYTHING_PROBES = ['id', 'name', 'status', 'x', 'created_at']
