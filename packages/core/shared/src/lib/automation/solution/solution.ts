import { BaseModelSchema, MappingMissingBehavior, Nullable } from '@fema-ipaas/core-utils'
import { Note, WorkflowTrigger } from '@fema-ipaas/workflow-core'
import { z } from 'zod'

export const SOLUTION_PACKAGE_FORMAT = 'fema-solution'
export const SOLUTION_PACKAGE_VERSION = 1
export const SOLUTION_NAME_MAX_LENGTH = 60
export const SOLUTION_SUMMARY_MAX_LENGTH = 300
export const SOLUTION_TABLE_PLACEHOLDER_PREFIX = 'table:'

export enum SolutionProvider {
    OFFICIAL = 'OFFICIAL',
    TENANT = 'TENANT',
}

export enum SolutionVisibility {
    TENANT = 'TENANT',
    PROJECT = 'PROJECT',
}

export enum SolutionCheckKind {
    CONNECTION = 'CONNECTION',
    MANUAL = 'MANUAL',
}

export enum SolutionCheckStatus {
    PASS = 'PASS',
    FAIL = 'FAIL',
    NEEDS_CONFIRM = 'NEEDS_CONFIRM',
}

export enum SolutionConfigType {
    SELECT = 'SELECT',
    RADIO = 'RADIO',
    TEXT = 'TEXT',
}

export const SolutionConfigOption = z.object({
    value: z.string(),
    label: z.string(),
    description: z.string().optional(),
    danger: z.boolean().optional(),
})
export type SolutionConfigOption = z.infer<typeof SolutionConfigOption>

export const SolutionPatch = z.object({
    workflowKey: z.string(),
    stepName: z.string(),
    inputKey: z.string(),
    value: z.string().optional(),
    valueByOption: z.record(z.string(), z.string()).optional(),
})
export type SolutionPatch = z.infer<typeof SolutionPatch>

export const SolutionConfigItem = z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(SolutionConfigType),
    options: z.array(SolutionConfigOption),
    defaultValue: z.string(),
    hint: z.string().optional(),
    affectsWorkflows: z.array(z.string()),
    patches: z.array(SolutionPatch),
})
export type SolutionConfigItem = z.infer<typeof SolutionConfigItem>

export const SolutionWorkflow = z.object({
    key: z.string(),
    name: z.string().trim().min(1),
    description: z.string().optional(),
    sourceWorkflowId: z.string().optional(),
    trigger: WorkflowTrigger,
    schemaVersion: Nullable(z.string()),
    notes: z.array(Note).optional(),
})
export type SolutionWorkflow = z.infer<typeof SolutionWorkflow>

export const SolutionMappingTable = z.object({
    key: z.string(),
    name: z.string(),
    description: z.string(),
    keyLabel: z.string(),
    valueLabel: z.string(),
    missingBehavior: z.enum(MappingMissingBehavior),
    defaultValue: Nullable(z.string()),
    rows: z.array(z.object({ k: z.string(), v: z.string() })),
})
export type SolutionMappingTable = z.infer<typeof SolutionMappingTable>

export const SolutionCheck = z.object({
    key: z.string(),
    label: z.string(),
    kind: z.enum(SolutionCheckKind),
    blocking: z.boolean(),
    connectorName: z.string().optional(),
    detail: z.string().optional(),
    who: z.string().optional(),
    fixSteps: z.array(z.string()),
})
export type SolutionCheck = z.infer<typeof SolutionCheck>

export const SolutionConnectionSlot = z.object({
    connectorName: z.string(),
    usedBy: z.array(z.string()),
})
export type SolutionConnectionSlot = z.infer<typeof SolutionConnectionSlot>

export const SolutionPackage = z.object({
    format: z.literal(SOLUTION_PACKAGE_FORMAT),
    version: z.literal(SOLUTION_PACKAGE_VERSION),
    connections: z.array(SolutionConnectionSlot),
    workflows: z.array(SolutionWorkflow),
    mappingTables: z.array(SolutionMappingTable),
    config: z.array(SolutionConfigItem),
    checks: z.array(SolutionCheck),
})
export type SolutionPackage = z.infer<typeof SolutionPackage>

export const SolutionVersionSummary = z.object({
    version: z.string(),
    notes: z.string(),
    publishedAt: z.string(),
})
export type SolutionVersionSummary = z.infer<typeof SolutionVersionSummary>

export const Solution = z.object({
    ...BaseModelSchema,
    tenantId: Nullable(z.string()),
    provider: z.enum(SolutionProvider),
    name: z.string(),
    summary: z.string(),
    category: z.string(),
    visibility: z.enum(SolutionVisibility),
    sourceProjectId: Nullable(z.string()),
    currentVersion: z.string(),
    createdBy: Nullable(z.string()),
})
export type Solution = z.infer<typeof Solution>

export const SolutionSummary = Solution.extend({
    workflowCount: z.number(),
    connectorNames: z.array(z.string()),
    installCount: z.number(),
    installedProjectIds: z.array(z.string()),
})
export type SolutionSummary = z.infer<typeof SolutionSummary>

export const SolutionDetail = SolutionSummary.extend({
    package: SolutionPackage,
    versions: z.array(SolutionVersionSummary),
})
export type SolutionDetail = z.infer<typeof SolutionDetail>

export const SolutionInstall = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    projectId: z.string(),
    solutionId: z.string(),
    solutionName: z.string(),
    version: z.string(),
    latestVersion: z.string(),
    config: z.record(z.string(), z.string()),
    connections: z.record(z.string(), z.string()),
    workflowIds: z.array(z.string()),
    mappingTableIds: z.array(z.string()),
    skippedChecks: z.array(z.string()),
    installedBy: z.string(),
})
export type SolutionInstall = z.infer<typeof SolutionInstall>

export const ListSolutionsRequestQuery = z.object({
    category: z.string().optional(),
    search: z.string().optional(),
    mine: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
})
export type ListSolutionsRequestQuery = z.infer<typeof ListSolutionsRequestQuery>

export const ListSolutionInstallsRequestQuery = z.object({
    projectId: z.string().optional(),
})
export type ListSolutionInstallsRequestQuery = z.infer<typeof ListSolutionInstallsRequestQuery>

export const SolutionInstallInput = z.object({
    projectId: z.string(),
    connections: z.record(z.string(), z.string()),
    config: z.record(z.string(), z.string()),
})
export type SolutionInstallInput = z.infer<typeof SolutionInstallInput>

export const InstallSolutionRequestBody = SolutionInstallInput.extend({
    acknowledgedChecks: z.array(z.string()),
})
export type InstallSolutionRequestBody = z.infer<typeof InstallSolutionRequestBody>

export const RunSolutionChecksRequestBody = z.object({
    projectId: z.string(),
    connections: z.record(z.string(), z.string()),
    checkKey: z.string().optional(),
})
export type RunSolutionChecksRequestBody = z.infer<typeof RunSolutionChecksRequestBody>

export const SolutionCheckResult = z.object({
    key: z.string(),
    label: z.string(),
    kind: z.enum(SolutionCheckKind),
    blocking: z.boolean(),
    status: z.enum(SolutionCheckStatus),
    message: Nullable(z.string()),
    detail: Nullable(z.string()),
    who: Nullable(z.string()),
    fixSteps: z.array(z.string()),
})
export type SolutionCheckResult = z.infer<typeof SolutionCheckResult>

export const SolutionCheckResults = z.object({ results: z.array(SolutionCheckResult) })
export type SolutionCheckResults = z.infer<typeof SolutionCheckResults>

export const SolutionInstallPreview = z.object({
    workflows: z.array(z.object({ key: z.string(), name: z.string() })),
    mappingTables: z.array(z.object({ key: z.string(), name: z.string(), reusedTableId: Nullable(z.string()) })),
    workflowLimit: Nullable(z.number()),
    currentWorkflowCount: z.number(),
    capacityError: Nullable(z.string()),
})
export type SolutionInstallPreview = z.infer<typeof SolutionInstallPreview>

export const CreateSolutionFromProjectRequestBody = z.object({
    projectId: z.string(),
    workflowIds: z.array(z.string()).min(1),
    name: z.string().trim().min(1).max(SOLUTION_NAME_MAX_LENGTH),
    summary: z.string().max(SOLUTION_SUMMARY_MAX_LENGTH),
    category: z.string().trim().min(1),
    visibility: z.enum(SolutionVisibility),
    manualChecks: z.array(z.object({ label: z.string().trim().min(1), detail: z.string().optional(), who: z.string().optional() })),
})
export type CreateSolutionFromProjectRequestBody = z.infer<typeof CreateSolutionFromProjectRequestBody>

export const PublishSolutionVersionRequestBody = z.object({
    notes: z.string().max(SOLUTION_SUMMARY_MAX_LENGTH),
})
export type PublishSolutionVersionRequestBody = z.infer<typeof PublishSolutionVersionRequestBody>

export const SolutionInstallResult = z.object({
    install: SolutionInstall,
    workflows: z.array(z.object({ key: z.string(), workflowId: z.string(), displayName: z.string() })),
    mappingTables: z.array(z.object({ key: z.string(), tableId: z.string(), name: z.string(), reused: z.boolean() })),
    skippedChecks: z.array(z.string()),
})
export type SolutionInstallResult = z.infer<typeof SolutionInstallResult>
