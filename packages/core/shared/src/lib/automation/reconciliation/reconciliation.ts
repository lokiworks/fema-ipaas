import { BaseModelSchema, formErrors } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export const ReconciliationFilter = z.object({ path: z.string().trim().min(1, formErrors.required), in: z.array(z.string()).min(1, formErrors.required) })
export type ReconciliationFilter = z.infer<typeof ReconciliationFilter>

export const ReconciliationExpectation = z.object({
    aspect: z.string().min(1, formErrors.required),
    when: z.array(ReconciliationFilter).default([]),
    expect: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('EXISTS') }),
        z.object({ kind: z.literal('EQUALS'), sourcePath: z.string().trim().min(1, formErrors.required), targetPath: z.string().trim().min(1, formErrors.required), mappingTableId: z.string().optional() }),
        z.object({ kind: z.literal('CONTAINS'), sourcePath: z.string().trim().min(1, formErrors.required), targetPath: z.string().trim().min(1, formErrors.required), mappingTableId: z.string().optional() }),
        z.object({ kind: z.literal('FLAG'), targetPath: z.string().trim().min(1, formErrors.required), value: z.boolean() }),
    ]),
})
export type ReconciliationExpectation = z.infer<typeof ReconciliationExpectation>

export const ReconciliationEndpoint = z.object({
    connectorName: z.string(), actionName: z.string(), connectionExternalId: z.string(),
    input: z.record(z.string(), z.unknown()).default({}), keyPath: z.string().min(1, formErrors.required),
})
export type ReconciliationEndpoint = z.infer<typeof ReconciliationEndpoint>

export const ReconciliationRuleBody = z.object({
    projectId: z.string(), name: z.string().trim().min(1, formErrors.required).max(100, 'reconciliation.nameTooLong'),
    workflowId: z.string(), source: ReconciliationEndpoint, target: ReconciliationEndpoint,
    scope: z.array(ReconciliationFilter).default([]), expectations: z.array(ReconciliationExpectation).min(1, formErrors.required).max(100, 'reconciliation.tooManyChecks').refine((checks) => new Set(checks.map((check) => check.aspect)).size === checks.length, 'reconciliation.duplicateAspect'),
    repair: z.object({ readActionName: z.string().min(1, formErrors.required), keyInput: z.string().min(1, formErrors.required) }),
    cron: z.string().default('17 2 * * *'), enabled: z.boolean().default(true),
    maxRepairsPerRun: z.number().int().min(0, formErrors.required).max(200, 'reconciliation.tooManyRepairs').default(20),
})
export type ReconciliationRuleBody = z.infer<typeof ReconciliationRuleBody>

export const ReconciliationRule = ReconciliationRuleBody.extend(BaseModelSchema)
export type ReconciliationRule = z.infer<typeof ReconciliationRule>

export const ReconciliationRun = z.object({
    ...BaseModelSchema, projectId: z.string(), ruleId: z.string(),
    status: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TRUNCATED']),
    startedAt: z.string().nullable(), finishedAt: z.string().nullable(),
    sourceCount: z.number(), targetCount: z.number(), matchedCount: z.number(), differenceCount: z.number(), repairedCount: z.number(), error: z.string().nullable(),
})
export type ReconciliationRun = z.infer<typeof ReconciliationRun>

export const ReconciliationDifference = z.object({
    ...BaseModelSchema, projectId: z.string(), ruleId: z.string(), businessKey: z.string(), aspect: z.string(),
    kind: z.enum(['MISSING_IN_TARGET', 'MISMATCH']), expected: z.unknown(), actual: z.unknown(),
    status: z.enum(['OPEN', 'REPAIRING', 'RESOLVED', 'IGNORED']), firstSeenRunId: z.string(), lastSeenRunId: z.string(),
    repairExecutionId: z.string().nullable(), resolvedAt: z.string().nullable(),
})
export type ReconciliationDifference = z.infer<typeof ReconciliationDifference>
