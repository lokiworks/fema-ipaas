import { z } from 'zod'
import { ApId } from '@fema/core-utils'
import { ExecutionStatus } from './state/workflow-execution'
import { WorkflowRetryStrategy } from './execution'

export const TestExecutionRequestBody = z.object({
    workflowVersionId: ApId,
})

export type TestExecutionRequestBody = z.infer<typeof TestExecutionRequestBody>

export const RetryWorkflowRequestBody = z.object({
    strategy: z.nativeEnum(WorkflowRetryStrategy),
    workspaceId: ApId,
})

export type RetryWorkflowRequestBody = z.infer<typeof RetryWorkflowRequestBody>


export const BulkActionOnRunsRequestBody = z.object({
    workspaceId: ApId,
    executionIds: z.array(ApId).optional(),
    excludeExecutionIds: z.array(ApId).optional(),
    strategy: z.nativeEnum(WorkflowRetryStrategy),
    status: z.array(z.nativeEnum(ExecutionStatus)).optional(),
    workflowId: z.array(ApId).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
})

export type BulkActionOnRunsRequestBody = z.infer<typeof BulkActionOnRunsRequestBody>

export const BulkCancelWorkflowRequestBody = z.object({
    workspaceId: ApId,
    executionIds: z.array(ApId).optional(),
    excludeExecutionIds: z.array(ApId).optional(),
    status: z.array(z.union([
        z.literal(ExecutionStatus.PAUSED),
        z.literal(ExecutionStatus.QUEUED),
    ])).optional(),
    workflowId: z.array(ApId).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
})

export type BulkCancelWorkflowRequestBody = z.infer<typeof BulkCancelWorkflowRequestBody>

export const BulkArchiveActionOnRunsRequestBody = z.object({
    workspaceId: ApId,
    executionIds: z.array(ApId).optional(),
    excludeExecutionIds: z.array(ApId).optional(),
    status: z.array(z.nativeEnum(ExecutionStatus)).optional(),
    workflowId: z.array(ApId).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    failedStepName: z.string().optional(),
    failedStepMessage: z.string().optional(),
})

export type BulkArchiveActionOnRunsRequestBody = z.infer<typeof BulkArchiveActionOnRunsRequestBody>
