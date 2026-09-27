import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum IssueStatus {
    OPEN = 'OPEN',
    INVESTIGATING = 'INVESTIGATING',
    RESOLVED = 'RESOLVED',
    IGNORED = 'IGNORED',
}

export enum IssueKind {
    STEP = 'STEP',
    CONNECTION = 'CONNECTION',
}

export enum IssueSeverity {
    HIGH = 'HIGH',
    MEDIUM = 'MEDIUM',
    LOW = 'LOW',
}

export enum IssueActivityType {
    FIRST_SEEN = 'FIRST_SEEN',
    REOPENED = 'REOPENED',
    STATUS_CHANGED = 'STATUS_CHANGED',
    ASSIGNED = 'ASSIGNED',
    MUTED = 'MUTED',
    NOTE = 'NOTE',
    ALERT_SENT = 'ALERT_SENT',
    REPLAYED = 'REPLAYED',
}

export const Issue = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    kind: z.enum(IssueKind),
    signature: z.string(),
    workflowId: Nullable(z.string()),
    stepName: Nullable(z.string()),
    stepDisplayName: Nullable(z.string()),
    connectionExternalId: Nullable(z.string()),
    errorCode: Nullable(z.string()),
    title: z.string(),
    message: z.string(),
    status: z.enum(IssueStatus),
    reopened: z.boolean(),
    assigneeId: Nullable(z.string()),
    mutedUntil: Nullable(z.string()),
    occurrences: z.number(),
    firstSeenAt: z.string(),
    lastSeenAt: z.string(),
    resolvedAt: Nullable(z.string()),
    resolvedById: Nullable(z.string()),
}).describe('Failed production runs of one project grouped by a shared cause.')
export type Issue = z.infer<typeof Issue>

export const IssueWithSeverity = Issue.extend({
    severity: z.enum(IssueSeverity),
    workflowDisplayName: Nullable(z.string()),
    affectedWorkflows: z.number(),
})
export type IssueWithSeverity = z.infer<typeof IssueWithSeverity>

export const IssueActivityData = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]))
export type IssueActivityData = z.infer<typeof IssueActivityData>

export const IssueActivity = z.object({
    ...BaseModelSchema,
    issueId: z.string(),
    projectId: z.string(),
    type: z.enum(IssueActivityType),
    actorId: Nullable(z.string()),
    data: IssueActivityData,
})
export type IssueActivity = z.infer<typeof IssueActivity>

export const IssueSummary = z.object({
    open: z.number(),
    openHighSeverity: z.number(),
    investigating: z.number(),
    investigatingAssignedToMe: z.number(),
    newOrReopenedToday: z.number(),
    muted: z.number(),
    failuresLast7Days: z.number(),
    issuesLast7Days: z.number(),
    alertsLast7Days: z.number(),
})
export type IssueSummary = z.infer<typeof IssueSummary>
