import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { ExecutionStatus } from '@fema-ipaas/workflow-core'
import { z } from 'zod'

export enum WorkflowReleaseStatus {
    PENDING = 'PENDING',
    DEPLOYED = 'DEPLOYED',
    REJECTED = 'REJECTED',
    WITHDRAWN = 'WITHDRAWN',
}

export enum ReleaseCheckLevel {
    OK = 'OK',
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
}

export enum ReleaseCheckCode {
    VERSION_VALID = 'VERSION_VALID',
    VERSION_INVALID = 'VERSION_INVALID',
    CONNECTIONS_OK = 'CONNECTIONS_OK',
    CONNECTION_MISSING = 'CONNECTION_MISSING',
    CONNECTION_UNHEALTHY = 'CONNECTION_UNHEALTHY',
    VARIABLES_OK = 'VARIABLES_OK',
    VARIABLE_MISSING = 'VARIABLE_MISSING',
    NO_TEST_RUNS = 'NO_TEST_RUNS',
    APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
    ALREADY_PUBLISHED = 'ALREADY_PUBLISHED',
}

export const WorkflowRelease = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    workflowId: z.string(),
    workflowVersionId: z.string(),
    previousVersionId: Nullable(z.string()),
    status: z.enum(WorkflowReleaseStatus),
    note: z.string(),
    requestedById: z.string(),
    approverIds: z.array(z.string()),
    decidedById: Nullable(z.string()),
    decidedAt: Nullable(z.string()),
    comment: Nullable(z.string()),
})
export type WorkflowRelease = z.infer<typeof WorkflowRelease>

export const WorkflowReleaseWithWorkflow = WorkflowRelease.extend({
    workflowDisplayName: z.string(),
})
export type WorkflowReleaseWithWorkflow = z.infer<typeof WorkflowReleaseWithWorkflow>

export const ReleaseCheck = z.object({
    level: z.enum(ReleaseCheckLevel),
    code: z.enum(ReleaseCheckCode),
    subject: z.string().nullable(),
})
export type ReleaseCheck = z.infer<typeof ReleaseCheck>

export const ReleaseTestRun = z.object({
    id: z.string(),
    status: z.enum(ExecutionStatus),
    created: z.string(),
})
export type ReleaseTestRun = z.infer<typeof ReleaseTestRun>

export const ReleaseEvidence = z.object({
    testRuns: z.number(),
    succeeded: z.number(),
    failed: z.number(),
    recent: z.array(ReleaseTestRun),
})
export type ReleaseEvidence = z.infer<typeof ReleaseEvidence>

export const WorkflowReleaseDetail = WorkflowReleaseWithWorkflow.extend({
    checks: z.array(ReleaseCheck),
    evidence: ReleaseEvidence,
    canApprove: z.boolean(),
})
export type WorkflowReleaseDetail = z.infer<typeof WorkflowReleaseDetail>

export const ConnectionReplacement = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    sourceConnectionId: z.string(),
    targetConnectionId: z.string(),
})
export type ConnectionReplacement = z.infer<typeof ConnectionReplacement>

export const ListWorkflowReleasesRequestQuery = z.object({
    projectId: z.string(),
    status: z.enum(WorkflowReleaseStatus).optional(),
    workflowId: z.string().optional(),
    mine: z.enum(['approver']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListWorkflowReleasesRequestQuery = z.infer<typeof ListWorkflowReleasesRequestQuery>

export const CreateWorkflowReleaseRequestBody = z.object({
    projectId: z.string(),
    workflowId: z.string(),
    versionId: z.string().optional(),
    note: z.string().trim().min(1, 'formErrors.required').max(300, 'releaseNoteTooLong'),
})
export type CreateWorkflowReleaseRequestBody = z.infer<typeof CreateWorkflowReleaseRequestBody>

export const ApproveWorkflowReleaseRequestBody = z.object({
    comment: z.string().trim().max(200, 'releaseCommentTooLong').optional(),
})
export type ApproveWorkflowReleaseRequestBody = z.infer<typeof ApproveWorkflowReleaseRequestBody>

export const RejectWorkflowReleaseRequestBody = z.object({
    comment: z.string().trim().min(1, 'formErrors.required').max(200, 'releaseCommentTooLong'),
})
export type RejectWorkflowReleaseRequestBody = z.infer<typeof RejectWorkflowReleaseRequestBody>

export const UpsertConnectionReplacementRequestBody = z.object({
    projectId: z.string(),
    sourceConnectionId: z.string(),
    targetConnectionId: z.string(),
})
export type UpsertConnectionReplacementRequestBody = z.infer<typeof UpsertConnectionReplacementRequestBody>

export const ListConnectionReplacementsRequestQuery = z.object({
    projectId: z.string(),
})
export type ListConnectionReplacementsRequestQuery = z.infer<typeof ListConnectionReplacementsRequestQuery>

export const DeployToTestRequestBody = z.object({
    projectId: z.string(),
    workflowId: z.string(),
})
export type DeployToTestRequestBody = z.infer<typeof DeployToTestRequestBody>

export const DeployToTestResponse = z.object({
    workflowId: z.string(),
    versionId: z.string(),
    deployedAt: z.string(),
})
export type DeployToTestResponse = z.infer<typeof DeployToTestResponse>

export const RollbackWorkflowRequestBody = z.object({
    projectId: z.string(),
    workflowId: z.string(),
    versionId: z.string(),
})
export type RollbackWorkflowRequestBody = z.infer<typeof RollbackWorkflowRequestBody>

export const RollbackWorkflowResponse = z.object({
    workflowId: z.string(),
    publishedVersionId: z.string(),
    withdrawnReleases: z.number(),
})
export type RollbackWorkflowResponse = z.infer<typeof RollbackWorkflowResponse>

export const UpdateEnvironmentSettingsRequestBody = z.object({
    projectId: z.string(),
    enabled: z.boolean(),
    approverIds: z.array(z.string()).max(20),
})
export type UpdateEnvironmentSettingsRequestBody = z.infer<typeof UpdateEnvironmentSettingsRequestBody>

export const EnvironmentWorkflow = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    enabled: z.boolean(),
    testVersionId: Nullable(z.string()),
    testDeployedAt: Nullable(z.string()),
    productionVersionId: Nullable(z.string()),
    testIsNewer: z.boolean(),
    pendingReleaseId: Nullable(z.string()),
})
export type EnvironmentWorkflow = z.infer<typeof EnvironmentWorkflow>

export const EnvironmentOverview = z.object({
    enabled: z.boolean(),
    approverIds: z.array(z.string()),
    test: z.object({
        deployed: z.number(),
        newerThanProduction: z.number(),
        replacements: z.number(),
    }),
    production: z.object({
        deployed: z.number(),
        running: z.number(),
        pendingApproval: z.number(),
    }),
    workflows: z.array(EnvironmentWorkflow),
})
export type EnvironmentOverview = z.infer<typeof EnvironmentOverview>
