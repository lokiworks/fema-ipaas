import { WorkflowRetryStrategy } from '@fema-ipaas/workflow-core'
import { z } from 'zod'
import { IssueSeverity, IssueStatus } from './issue'

export enum IssueListView {
    UNRESOLVED = 'UNRESOLVED',
    OPEN = 'OPEN',
    REOPENED = 'REOPENED',
    INVESTIGATING = 'INVESTIGATING',
    TODAY = 'TODAY',
    MUTED = 'MUTED',
    RESOLVED = 'RESOLVED',
    IGNORED = 'IGNORED',
    ALL = 'ALL',
}

export enum IssueSort {
    LAST_SEEN = 'LAST_SEEN',
    OCCURRENCES = 'OCCURRENCES',
    SEVERITY = 'SEVERITY',
}

export enum IssueTrendGranularity {
    HOUR = 'HOUR',
    DAY = 'DAY',
}

export enum ReplayCategory {
    REPLAYABLE = 'REPLAYABLE',
    DATA_PROBLEM = 'DATA_PROBLEM',
    BLOCKED = 'BLOCKED',
    NOT_NEEDED = 'NOT_NEEDED',
}

export enum ReplayReason {
    CONNECTION_RECOVERED = 'CONNECTION_RECOVERED',
    TRANSIENT_ERROR = 'TRANSIENT_ERROR',
    AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
    WORKFLOW_CHANGED = 'WORKFLOW_CHANGED',
    MAPPING_TABLE_CHANGED = 'MAPPING_TABLE_CHANGED',
    UNCHANGED_SINCE_FAILURE = 'UNCHANGED_SINCE_FAILURE',
    REJECTED_BY_TARGET = 'REJECTED_BY_TARGET',
    CONNECTION_STILL_BROKEN = 'CONNECTION_STILL_BROKEN',
    CONNECTION_DELETED = 'CONNECTION_DELETED',
    DUPLICATE_ATTEMPT = 'DUPLICATE_ATTEMPT',
    ALREADY_RETRIED = 'ALREADY_RETRIED',
    WORKFLOW_DELETED = 'WORKFLOW_DELETED',
    FAILED_STEP_MISSING = 'FAILED_STEP_MISSING',
    BLOCKED_UNTIL = 'BLOCKED_UNTIL',
}

export enum IssueInsightCause {
    CONNECTION_AUTH = 'CONNECTION_AUTH',
    STEP_TIMEOUT = 'STEP_TIMEOUT',
    RATE_LIMITED = 'RATE_LIMITED',
    NOT_FOUND = 'NOT_FOUND',
    UPSTREAM_TIMEOUT = 'UPSTREAM_TIMEOUT',
    REJECTED_INPUT = 'REJECTED_INPUT',
    ACCESS_DENIED = 'ACCESS_DENIED',
    UPSTREAM_ERROR = 'UPSTREAM_ERROR',
    STEP_ERROR = 'STEP_ERROR',
    BLOCKED_UNTIL = 'BLOCKED_UNTIL',
    RESULT_MISMATCH = 'RESULT_MISMATCH',
}

export const VERIFICATION_DEFAULT_WINDOW_HOURS = 72
export const VERIFICATION_MAX_WINDOW_HOURS = 24 * 14

export const RunVerificationRequestBody = z.object({
    projectId: z.string(),
    sinceHours: z.number().int().min(1).max(VERIFICATION_MAX_WINDOW_HOURS).optional(),
})
export type RunVerificationRequestBody = z.infer<typeof RunVerificationRequestBody>

export const RunVerificationResult = z.object({
    checked: z.number(),
    matched: z.number(),
    mismatched: z.number(),
    unreadable: z.number(),
    skipped: z.number(),
    truncated: z.boolean(),
    issueIds: z.array(z.string()),
    problems: z.array(z.object({
        businessKey: z.string(),
        stepName: z.string(),
        outcome: z.enum(['MISMATCHED', 'UNREADABLE']),
        detail: z.string(),
    })),
})
export type RunVerificationResult = z.infer<typeof RunVerificationResult>

export enum IssueFixKind {
    REAUTHORIZE_CONNECTION = 'REAUTHORIZE_CONNECTION',
    OPEN_STEP_INPUT = 'OPEN_STEP_INPUT',
    OPEN_STEP_ERROR_HANDLING = 'OPEN_STEP_ERROR_HANDLING',
    REPLAY_FROM_FAILED_STEP = 'REPLAY_FROM_FAILED_STEP',
    REPLAY_FULL = 'REPLAY_FULL',
    OPEN_RUN = 'OPEN_RUN',
    IGNORE = 'IGNORE',
}

export const MUTE_DURATIONS_HOURS = [1, 4, 24] as const

export const ListIssuesRequestQuery = z.object({
    projectId: z.string(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    view: z.enum(IssueListView).optional(),
    severity: z.enum(IssueSeverity).optional(),
    assignee: z.string().optional(),
    workflowId: z.string().optional(),
    search: z.string().optional(),
    sort: z.enum(IssueSort).optional(),
    timezone: z.string().max(64).optional(),
})
export type ListIssuesRequestQuery = z.infer<typeof ListIssuesRequestQuery>

export const IssueProjectQuery = z.object({
    projectId: z.string(),
    timezone: z.string().max(64).optional(),
})
export type IssueProjectQuery = z.infer<typeof IssueProjectQuery>

export const UpdateIssueRequestBody = z.object({
    status: z.enum(IssueStatus).optional(),
    assigneeId: z.string().nullable().optional(),
    mutedForHours: z.union([z.literal(1), z.literal(4), z.literal(24)]).nullable().optional(),
})
export type UpdateIssueRequestBody = z.infer<typeof UpdateIssueRequestBody>

export const BatchUpdateIssuesRequestBody = UpdateIssueRequestBody.extend({
    projectId: z.string(),
    ids: z.array(z.string()).min(1).max(100),
})
export type BatchUpdateIssuesRequestBody = z.infer<typeof BatchUpdateIssuesRequestBody>

export const AddIssueNoteRequestBody = z.object({
    text: z.string().trim().min(1, 'formErrors.required').max(500, 'issueNoteTooLong'),
})
export type AddIssueNoteRequestBody = z.infer<typeof AddIssueNoteRequestBody>

export const IssueTrendQuery = z.object({
    projectId: z.string(),
    granularity: z.enum(IssueTrendGranularity).optional(),
    timezone: z.string().max(64).optional(),
})
export type IssueTrendQuery = z.infer<typeof IssueTrendQuery>

export const IssueTrendBucket = z.object({
    start: z.string(),
    count: z.number(),
})
export type IssueTrendBucket = z.infer<typeof IssueTrendBucket>

export const IssueTrend = z.object({
    granularity: z.enum(IssueTrendGranularity),
    buckets: z.array(IssueTrendBucket),
})
export type IssueTrend = z.infer<typeof IssueTrend>

export const IssueReplayRequestBody = z.object({
    strategy: z.enum(WorkflowRetryStrategy),
    includeDataProblems: z.boolean().optional(),
})
export type IssueReplayRequestBody = z.infer<typeof IssueReplayRequestBody>

export const ReplayCheckItem = z.object({
    executionId: z.string(),
    category: z.enum(ReplayCategory),
    reason: z.enum(ReplayReason),
    connectionExternalId: z.string().nullable(),
    rawDataExpired: z.boolean(),
    blockedUntil: z.string().nullable().optional(),
})
export type ReplayCheckItem = z.infer<typeof ReplayCheckItem>

export const ReplayCheckResult = z.object({
    items: z.array(ReplayCheckItem),
})
export type ReplayCheckResult = z.infer<typeof ReplayCheckResult>

export const IssueReplayResult = z.object({
    queued: z.number(),
    skipped: z.number(),
})
export type IssueReplayResult = z.infer<typeof IssueReplayResult>

export const IssueFix = z.object({
    kind: z.enum(IssueFixKind),
    disabledReason: z.enum(ReplayReason).nullable(),
})
export type IssueFix = z.infer<typeof IssueFix>

export const IssueInsight = z.object({
    cause: z.enum(IssueInsightCause),
    confidence: z.number(),
    httpStatus: z.number().nullable(),
    blockedUntil: z.string().nullable().optional(),
    fixes: z.array(IssueFix),
})
export type IssueInsight = z.infer<typeof IssueInsight>
