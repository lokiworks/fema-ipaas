import { BaseModelSchema, DateOrString, Nullable } from '@fema/core-utils'
import { WorkflowStatus } from '@fema/workflow-core'
import { z } from 'zod'
import { UserWithMetaInformation } from '../../core/user'

export enum AnalyticsTimePeriod {
    LAST_WEEK = 'last-week',
    LAST_MONTH = 'last-month',
    LAST_THREE_MONTHS = 'last-three-months',
    LAST_SIX_MONTHS = 'last-six-months',
    LAST_YEAR = 'last-year',
}

export const AnalyticsRunsUsageItem = z.object({
    day: z.string(),
    workflowId: z.string(),
    runs: z.number(),
})
export type AnalyticsRunsUsageItem = z.infer<typeof AnalyticsRunsUsageItem>

export const AnalyticsRunsUsage = z.array(AnalyticsRunsUsageItem)
export type AnalyticsRunsUsage = z.infer<typeof AnalyticsRunsUsage>

export const AnalyticsWorkflowReportItem = z.object({
    workflowId: z.string(),
    workflowName: z.string(),
    workspaceId: z.string(),
    workspaceName: z.string(),
    status: z.nativeEnum(WorkflowStatus),
    timeSavedPerRun: Nullable(z.number()),
    ownerId: Nullable(z.string()),
})
export type AnalyticsWorkflowReportItem = z.infer<typeof AnalyticsWorkflowReportItem>

export const AnalyticsWorkflowReport = z.array(AnalyticsWorkflowReportItem)
export type AnalyticsWorkflowReport = z.infer<typeof AnalyticsWorkflowReport>

export const PlatformAnalyticsReport = z.object({
    ...BaseModelSchema,
    cachedAt: DateOrString,
    runs: AnalyticsRunsUsage,
    outdated: z.boolean(),
    workflows: AnalyticsWorkflowReport,
    platformId: z.string(),
    users: z.array(UserWithMetaInformation),
})
export type PlatformAnalyticsReport = z.infer<typeof PlatformAnalyticsReport>

export const AnalyticsReportRequest = z.object({
    timePeriod: z.nativeEnum(AnalyticsTimePeriod).optional(),
})
export type AnalyticsReportRequest = z.infer<typeof AnalyticsReportRequest>
