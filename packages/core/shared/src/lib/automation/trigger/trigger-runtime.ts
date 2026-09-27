import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

const MAX_HOLIDAY_DATES = 2000

export const DedupedEvent = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    workflowId: z.string(),
    workflowVersionId: z.string(),
    keyHash: z.string(),
    keyPreview: z.string(),
    keyPath: z.string(),
    windowSeconds: z.number(),
    firstExecutionId: Nullable(z.string()),
})
export type DedupedEvent = z.infer<typeof DedupedEvent>

export const DedupedEventWithWorkflow = DedupedEvent.extend({
    workflowDisplayName: Nullable(z.string()),
})
export type DedupedEventWithWorkflow = z.infer<typeof DedupedEventWithWorkflow>

export const ListDedupedEventsRequestQuery = z.object({
    projectId: z.string(),
    workflowId: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
})
export type ListDedupedEventsRequestQuery = z.infer<typeof ListDedupedEventsRequestQuery>

export const DedupedEventStatsRequestQuery = z.object({
    projectId: z.string(),
    workflowId: z.string(),
})
export type DedupedEventStatsRequestQuery = z.infer<typeof DedupedEventStatsRequestQuery>

export const DedupedEventStats = z.object({
    lastSevenDays: z.number(),
})
export type DedupedEventStats = z.infer<typeof DedupedEventStats>

export const HolidayCalendar = z.object({
    dates: z.array(z.string()),
    updated: Nullable(z.string()),
})
export type HolidayCalendar = z.infer<typeof HolidayCalendar>

export const UpdateHolidayCalendarRequestBody = z.object({
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'holidayDateInvalid')).max(MAX_HOLIDAY_DATES, 'holidayCalendarTooManyDates'),
})
export type UpdateHolidayCalendarRequestBody = z.infer<typeof UpdateHolidayCalendarRequestBody>

export const HOLIDAY_CALENDAR_MAX_DATES = MAX_HOLIDAY_DATES
