import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export const AGENT_APPROVAL_TIMEOUT_HOURS = [1, 4, 24]

export enum AgentApprovalStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    EXPIRED = 'EXPIRED',
}

export const AgentApproval = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    workflowId: z.string(),
    executionId: z.string(),
    stepName: z.string(),
    tool: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    message: z.string(),
    status: z.enum(AgentApprovalStatus),
    approverIds: z.array(z.string()),
    decidedById: Nullable(z.string()),
    decidedAt: Nullable(z.string()),
    comment: Nullable(z.string()),
    expiresAt: z.string(),
})
export type AgentApproval = z.infer<typeof AgentApproval>

export const AgentApprovalWithWorkflow = AgentApproval.extend({
    workflowDisplayName: z.string(),
    canDecide: z.boolean(),
})
export type AgentApprovalWithWorkflow = z.infer<typeof AgentApprovalWithWorkflow>

export const CreateAgentApprovalRequestBody = z.object({
    executionId: z.string(),
    stepName: z.string(),
    waitpointId: z.string(),
    tool: z.string().max(200),
    arguments: z.record(z.string(), z.unknown()),
    message: z.string().max(2000),
    timeoutHours: z.number().int().min(1).max(24),
})
export type CreateAgentApprovalRequestBody = z.infer<typeof CreateAgentApprovalRequestBody>

export const CreateAgentApprovalResponse = z.object({
    id: z.string(),
})
export type CreateAgentApprovalResponse = z.infer<typeof CreateAgentApprovalResponse>

export const DecideAgentApprovalRequestBody = z.object({
    approved: z.boolean(),
    comment: z.string().trim().max(200, 'approvalCommentTooLong').optional(),
}).superRefine((body, ctx) => {
    if (!body.approved && (body.comment === undefined || body.comment.length === 0)) {
        ctx.addIssue({ code: 'custom', path: ['comment'], message: 'rejectionReasonRequired' })
    }
})
export type DecideAgentApprovalRequestBody = z.infer<typeof DecideAgentApprovalRequestBody>

export const ListAgentApprovalsRequestQuery = z.object({
    projectId: z.string(),
    status: z.enum(AgentApprovalStatus).optional(),
    executionId: z.string().optional(),
})
export type ListAgentApprovalsRequestQuery = z.infer<typeof ListAgentApprovalsRequestQuery>

export const AgentApprovalDecision = z.object({
    approvalId: z.string(),
    approved: z.boolean(),
    expired: z.boolean(),
    comment: Nullable(z.string()),
})
export type AgentApprovalDecision = z.infer<typeof AgentApprovalDecision>
