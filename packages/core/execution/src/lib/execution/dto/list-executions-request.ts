import { z } from 'zod'
import { OptionalArrayFromQuery, OptionalBooleanFromQuery } from '@fema/core-utils'
import { ApId } from '@fema/core-utils'
import { ExecutionStatus } from '../state/flow-execution'

export const ListExecutionsRequestQuery = z.object({
    flowId: OptionalArrayFromQuery(ApId),
    tags: OptionalArrayFromQuery(z.string()),
    status: OptionalArrayFromQuery(z.nativeEnum(ExecutionStatus)),
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    workspaceId: ApId,
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
    executionIds: OptionalArrayFromQuery(ApId),
    includeArchived: OptionalBooleanFromQuery,
})

export type ListExecutionsRequestQuery = z.infer<typeof ListExecutionsRequestQuery>

export const CountExecutionsByStatusRequest = z.object({
    workspaceId: ApId,
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
})

export const ExecutionCountByStatus = z.object({
    status: z.nativeEnum(ExecutionStatus),
    count: z.number(),
})

export const CountExecutionsByStatusResponse = z.object({
    data: z.array(ExecutionCountByStatus),
})

export type CountExecutionsByStatusRequest = z.infer<typeof CountExecutionsByStatusRequest>
export type ExecutionCountByStatus = z.infer<typeof ExecutionCountByStatus>
export type CountExecutionsByStatusResponse = z.infer<typeof CountExecutionsByStatusResponse>
