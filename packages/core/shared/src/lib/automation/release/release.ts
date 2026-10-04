import { BaseModelSchema, Nullable } from '@fema-ipaas/core-utils'
import { ExecutionStatus } from '@fema-ipaas/workflow-core'
import { z } from 'zod'

export enum WorkflowReleaseStatus {
    PENDING = 'PENDING',
    DEPLOYED = 'DEPLOYED',
    REJECTED = 'REJECTED',
    WITHDRAWN = 'WITHDRAWN',
}

export enum ReleaseChangeAction {
    DEPLOYED_TO_TEST = 'DEPLOYED_TO_TEST',
    REQUESTED = 'REQUESTED',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    WITHDRAWN = 'WITHDRAWN',
    ROLLED_BACK = 'ROLLED_BACK',
    PUBLISHED_DIRECTLY = 'PUBLISHED_DIRECTLY',
    ENVIRONMENTS_UPDATED = 'ENVIRONMENTS_UPDATED',
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
    CONNECTION_IS_TEST_ONLY = 'CONNECTION_IS_TEST_ONLY',
    CONNECTION_NOT_REPLACED = 'CONNECTION_NOT_REPLACED',
    VARIABLES_OK = 'VARIABLES_OK',
    VARIABLE_MISSING = 'VARIABLE_MISSING',
    VARIABLE_NO_TEST_VALUE = 'VARIABLE_NO_TEST_VALUE',
    NO_TEST_RUNS = 'NO_TEST_RUNS',
    APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
    ALREADY_PUBLISHED = 'ALREADY_PUBLISHED',
}

export const ReleaseSystemComment = {
    WITHDRAWN_BY_ROLLBACK: 'Withdrawn automatically by a rollback',
    WITHDRAWN_BY_WORKFLOW_DELETION: 'Withdrawn automatically because the workflow was deleted',
} as const

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

export const ReleaseChange = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    workflowId: Nullable(z.string()),
    action: z.enum(ReleaseChangeAction),
    actorId: z.string(),
    fromVersionId: Nullable(z.string()),
    toVersionId: Nullable(z.string()),
    restoredVersionId: Nullable(z.string()),
    note: Nullable(z.string()),
    comment: Nullable(z.string()),
    approverIds: z.array(z.string()),
    releaseId: Nullable(z.string()),
    environmentsEnabled: Nullable(z.boolean()),
})
export type ReleaseChange = z.infer<typeof ReleaseChange>

export const ReleaseChangeWithDetails = ReleaseChange.extend({
    actorName: z.string(),
    approverNames: z.array(z.string()),
    workflowDisplayName: Nullable(z.string()),
    fromVersionNumber: Nullable(z.number()),
    toVersionNumber: Nullable(z.number()),
    restoredVersionNumber: Nullable(z.number()),
})
export type ReleaseChangeWithDetails = z.infer<typeof ReleaseChangeWithDetails>

export const ReleasePreviewRequestQuery = z.object({
    projectId: z.string(),
    workflowId: z.string(),
})
export type ReleasePreviewRequestQuery = z.infer<typeof ReleasePreviewRequestQuery>

export const ReleaseCheck = z.object({
    level: z.enum(ReleaseCheckLevel),
    code: z.enum(ReleaseCheckCode),
    subject: z.string().nullable(),
})
export type ReleaseCheck = z.infer<typeof ReleaseCheck>

export const ReleasePreview = z.object({
    workflowId: z.string(),
    workflowDisplayName: z.string(),
    testVersionId: z.string(),
    testVersionNumber: Nullable(z.number()),
    productionVersionId: Nullable(z.string()),
    productionVersionNumber: Nullable(z.number()),
    approverIds: z.array(z.string()),
    checks: z.array(ReleaseCheck),
    canSubmit: z.boolean(),
})
export type ReleasePreview = z.infer<typeof ReleasePreview>

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

export const ListReleaseChangesRequestQuery = z.object({
    projectId: z.string(),
    workflowId: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListReleaseChangesRequestQuery = z.infer<typeof ListReleaseChangesRequestQuery>

export const ListConnectionReplacementsRequestQuery = z.object({
    projectId: z.string(),
})
export type ListConnectionReplacementsRequestQuery = z.infer<typeof ListConnectionReplacementsRequestQuery>

export const DeployToTestRequestBody = z.object({
    projectId: z.string(),
    workflowId: z.string(),
    note: z.string().trim().max(300, 'releaseNoteTooLong').optional(),
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
    reason: z.string().trim().max(300, 'releaseNoteTooLong').optional(),
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

export const UnreplacedConnection = z.object({
    connectionId: z.string(),
    displayName: z.string(),
    workflowNames: z.array(z.string()),
})
export type UnreplacedConnection = z.infer<typeof UnreplacedConnection>

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
    unreplacedConnections: z.array(UnreplacedConnection),
    workflows: z.array(EnvironmentWorkflow),
})
export type EnvironmentOverview = z.infer<typeof EnvironmentOverview>
