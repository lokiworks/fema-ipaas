import { z } from 'zod'
import { ApId } from '@fema/core-utils'
import { ExecutionStatus } from './state/flow-execution'
import { FlowRetryStrategy } from './execution'

export const TestExecutionRequestBody = z.object({
    flowVersionId: ApId,
})

export type TestExecutionRequestBody = z.infer<typeof TestExecutionRequestBody>

export const RetryFlowRequestBody = z.object({
    strategy: z.nativeEnum(FlowRetryStrategy),
    workspaceId: ApId,
})

export type RetryFlowRequestBody = z.infer<typeof RetryFlowRequestBody>


export const BulkActionOnRunsRequestBody = z.object({
    workspaceId: ApId,
    executionIds: z.array(ApId).optional(),
    excludeExecutionIds: z.array(ApId).optional(),
    strategy: z.nativeEnum(FlowRetryStrategy),
    status: z.array(z.nativeEnum(ExecutionStatus)).optional(),
    flowId: z.array(ApId).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
})

export type BulkActionOnRunsRequestBody = z.infer<typeof BulkActionOnRunsRequestBody>

export const BulkCancelFlowRequestBody = z.object({
    workspaceId: ApId,
    executionIds: z.array(ApId).optional(),
    excludeExecutionIds: z.array(ApId).optional(),
    status: z.array(z.union([
        z.literal(ExecutionStatus.PAUSED),
        z.literal(ExecutionStatus.QUEUED),
    ])).optional(),
    flowId: z.array(ApId).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
})

export type BulkCancelFlowRequestBody = z.infer<typeof BulkCancelFlowRequestBody>

export const BulkArchiveActionOnRunsRequestBody = z.object({
    workspaceId: ApId,
    executionIds: z.array(ApId).optional(),
    excludeExecutionIds: z.array(ApId).optional(),
    status: z.array(z.nativeEnum(ExecutionStatus)).optional(),
    flowId: z.array(ApId).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
})

export type BulkArchiveActionOnRunsRequestBody = z.infer<typeof BulkArchiveActionOnRunsRequestBody>
