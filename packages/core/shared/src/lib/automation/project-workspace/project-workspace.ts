import { MappingMissingBehavior, Nullable } from '@fema-ipaas/core-utils'
import { MappingTableRow } from '../mapping-table/mapping-table'
import { ExecutionStatus, Folder, Note, WorkflowStatus, WorkflowTrigger } from '@fema-ipaas/workflow-core'
import { z } from 'zod'

export const WORKFLOW_NAME_MAX_LENGTH = 100
export const WORKFLOW_DESCRIPTION_MAX_LENGTH = 300
export const WORKFLOW_EXPORT_FORMAT = 'workflow-export'
export const WORKFLOW_EXPORT_VERSION = 1
export const WORKFLOW_BATCH_LIMIT = 100
export const PUBLISH_DESCRIPTION_MAX_LENGTH = 300

export const WorkflowExportMappingTable = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    keyLabel: z.string(),
    valueLabel: z.string(),
    missingBehavior: z.enum(MappingMissingBehavior),
    defaultValue: z.string().nullable(),
    rows: z.array(MappingTableRow),
})
export type WorkflowExportMappingTable = z.infer<typeof WorkflowExportMappingTable>

export const WorkflowExportFile = z.object({
    format: z.literal(WORKFLOW_EXPORT_FORMAT),
    version: z.literal(WORKFLOW_EXPORT_VERSION),
    exportedAt: z.string(),
    workflow: z.object({
        name: z.string().trim().min(1),
        description: z.string().optional(),
        trigger: WorkflowTrigger,
        schemaVersion: Nullable(z.string()),
        notes: z.array(Note).optional(),
    }),
    mappingTables: z.array(WorkflowExportMappingTable).optional(),
})
export type WorkflowExportFile = z.infer<typeof WorkflowExportFile>

export const ImportWorkflowFileRequestBody = z.object({
    projectId: z.string(),
    folderId: z.string().optional(),
    file: WorkflowExportFile,
})
export type ImportWorkflowFileRequestBody = z.infer<typeof ImportWorkflowFileRequestBody>

export const CopyWorkflowRequestBody = z.object({
    projectId: z.string(),
    targetProjectId: z.string(),
    folderId: z.string().optional(),
})
export type CopyWorkflowRequestBody = z.infer<typeof CopyWorkflowRequestBody>

export const WorkflowTransferResult = z.object({
    workflowId: z.string(),
    projectId: z.string(),
    displayName: z.string(),
    clearedConnections: z.number(),
})
export type WorkflowTransferResult = z.infer<typeof WorkflowTransferResult>

export const WorkflowBatchRequestBody = z.object({
    projectId: z.string(),
    workflowIds: z.array(z.string()).min(1).max(WORKFLOW_BATCH_LIMIT),
})
export type WorkflowBatchRequestBody = z.infer<typeof WorkflowBatchRequestBody>

export enum BatchPublishCheckStatus {
    READY = 'READY',
    WARNING = 'WARNING',
    INVALID = 'INVALID',
    UNCHANGED = 'UNCHANGED',
}

export const BatchPublishCheckItem = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    status: z.enum(BatchPublishCheckStatus),
    reasons: z.array(z.string()),
})
export type BatchPublishCheckItem = z.infer<typeof BatchPublishCheckItem>

export const BatchPublishCheckResponse = z.object({
    target: z.enum(['PRODUCTION', 'TEST']),
    items: z.array(BatchPublishCheckItem),
})
export type BatchPublishCheckResponse = z.infer<typeof BatchPublishCheckResponse>

export const BatchPublishRequestBody = WorkflowBatchRequestBody.extend({
    description: z.string().trim().max(PUBLISH_DESCRIPTION_MAX_LENGTH, 'publishDescriptionTooLong').optional(),
})
export type BatchPublishRequestBody = z.infer<typeof BatchPublishRequestBody>

export const BatchPublishResultItem = z.object({
    workflowId: z.string(),
    displayName: z.string(),
    success: z.boolean(),
    error: Nullable(z.string()),
})
export type BatchPublishResultItem = z.infer<typeof BatchPublishResultItem>

export const BatchPublishResponse = z.object({
    target: z.enum(['PRODUCTION', 'TEST']),
    items: z.array(BatchPublishResultItem),
})
export type BatchPublishResponse = z.infer<typeof BatchPublishResponse>

export const BatchMoveRequestBody = WorkflowBatchRequestBody.extend({
    folderId: Nullable(z.string()),
})
export type BatchMoveRequestBody = z.infer<typeof BatchMoveRequestBody>

export const BatchDeleteResponse = z.object({
    deleted: z.number(),
    withdrawnReleases: z.number(),
})
export type BatchDeleteResponse = z.infer<typeof BatchDeleteResponse>

export const ProjectTreeWorkflow = z.object({
    id: z.string(),
    displayName: z.string(),
    folderId: Nullable(z.string()),
    status: z.enum(WorkflowStatus),
    published: z.boolean(),
    hasUnpublishedChanges: z.boolean(),
    updated: z.string(),
    ownerId: Nullable(z.string()),
    description: Nullable(z.string()),
})
export type ProjectTreeWorkflow = z.infer<typeof ProjectTreeWorkflow>

export const ProjectTree = z.object({
    folders: z.array(Folder),
    workflows: z.array(ProjectTreeWorkflow),
})
export type ProjectTree = z.infer<typeof ProjectTree>

export const ProjectWorkflowStats = z.object({
    workflowId: z.string(),
    lastRunAt: Nullable(z.string()),
    lastRunStatus: Nullable(z.enum(ExecutionStatus)),
    runs7d: z.number(),
    succeeded7d: z.number(),
    failed7d: z.number(),
    productionVersionNumber: Nullable(z.number()),
    testVersionNumber: Nullable(z.number()),
})
export type ProjectWorkflowStats = z.infer<typeof ProjectWorkflowStats>

export const ProjectOverviewStats = z.object({
    workflows: z.array(ProjectWorkflowStats),
    runs: z.object({
        last7d: z.number(),
        previous7d: z.number(),
        succeeded7d: z.number(),
        failed7d: z.number(),
        thisMonth: z.number(),
    }),
})
export type ProjectOverviewStats = z.infer<typeof ProjectOverviewStats>

export const ProjectWorkspaceQuery = z.object({
    projectId: z.string(),
    timezone: z.string().max(64).optional(),
})
export type ProjectWorkspaceQuery = z.infer<typeof ProjectWorkspaceQuery>
