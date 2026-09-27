import {
    BaseModelSchema,
    BLUEPRINT_LIMITS,
    BlueprintChangeKind,
    BlueprintChangeType,
    BlueprintConnectorState,
    BlueprintHttpMethod,
    BlueprintIssueCode,
    BlueprintIssueSection,
    BlueprintVersionAction,
    BlueprintVersionStatus,
    ConnectorBlueprintDefinition,
} from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum ConnectorBlueprintListFilter {
    MINE = 'MINE',
    COLLABORATING = 'COLLABORATING',
    ALL = 'ALL',
}

export enum BlueprintTestKind {
    FLOW = 'FLOW',
    API = 'API',
}

export enum BlueprintTestStatus {
    PASSED = 'PASSED',
    FAILED = 'FAILED',
}

export enum BlueprintPublishMode {
    NEW_VERSION = 'NEW_VERSION',
    UPDATE_CURRENT = 'UPDATE_CURRENT',
}

export enum BlueprintRollout {
    FULL = 'FULL',
    CANARY = 'CANARY',
}

export const BlueprintTestResult = z.object({
    status: z.enum(BlueprintTestStatus),
    message: z.string(),
    durationMs: z.number(),
    at: z.string(),
    hash: z.string(),
    operationKey: z.string().nullable(),
})

export const BlueprintAuthState = z.object({
    publishedHash: z.string().nullable(),
    publishedAt: z.string().nullable(),
    publishedType: z.string().nullable(),
    testRevision: z.number(),
    flowTest: BlueprintTestResult.nullable(),
    apiTest: BlueprintTestResult.nullable(),
})

export const BlueprintDebugRecord = z.object({
    id: z.string(),
    operationKey: z.string(),
    at: z.string(),
    input: z.record(z.string(), z.unknown()),
    success: z.boolean(),
    status: z.number(),
    durationMs: z.number(),
})

export const BlueprintDraftBuild = z.object({
    hash: z.string(),
    archiveId: z.string(),
    packageVersion: z.string(),
})

export const ConnectorBlueprint = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    identifier: z.string(),
    connectorName: z.string(),
    ownerId: z.string(),
    collaboratorIds: z.array(z.string()),
    definition: ConnectorBlueprintDefinition,
    publishedDefinition: z.nullable(ConnectorBlueprintDefinition),
    authState: BlueprintAuthState,
    debugRecords: z.array(BlueprintDebugRecord),
    draftBuild: BlueprintDraftBuild.nullable(),
})

export const BlueprintVersionUpdate = z.object({
    packageVersion: z.string(),
    description: z.string(),
    publishedBy: z.string(),
    publishedAt: z.string(),
})

export const ConnectorBlueprintVersion = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    blueprintId: z.string(),
    connectorName: z.string(),
    version: z.string(),
    packageVersion: z.string(),
    status: z.enum(BlueprintVersionStatus),
    canaryProjectIds: z.array(z.string()),
    description: z.string(),
    publishedBy: z.string(),
    publishedAt: z.string(),
    updates: z.array(BlueprintVersionUpdate),
    definition: ConnectorBlueprintDefinition,
})

export const BlueprintPerson = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
})

export const BlueprintChangeView = z.object({
    id: z.string(),
    kind: z.enum(BlueprintChangeKind),
    key: z.string(),
    name: z.string(),
    method: z.enum(BlueprintHttpMethod).nullable(),
    change: z.enum(BlueprintChangeType),
    before: z.unknown(),
    after: z.unknown(),
    changedFields: z.array(z.string()),
})

export const BlueprintIssueView = z.object({
    code: z.enum(BlueprintIssueCode),
    section: z.enum(BlueprintIssueSection),
    key: z.string().nullable(),
    name: z.string().nullable(),
})

export const BlueprintVersionView = z.object({
    id: z.string(),
    version: z.string(),
    packageVersion: z.string(),
    status: z.enum(BlueprintVersionStatus),
    canaryProjectIds: z.array(z.string()),
    description: z.string(),
    publishedBy: BlueprintPerson.nullable(),
    publishedAt: z.string(),
    updates: z.array(BlueprintVersionUpdate.extend({ publishedByName: z.string().nullable() })),
    operationKeys: z.array(z.string()),
    triggerKeys: z.array(z.string()),
    usage: z.number(),
})

export const BlueprintAuthStatus = z.object({
    published: z.boolean(),
    everPublished: z.boolean(),
    typeLocked: z.boolean(),
    flowTest: BlueprintTestResult.nullable(),
    apiTest: BlueprintTestResult.nullable(),
    testData: z.record(z.string(), z.string()),
    secretKeys: z.array(z.string()),
    hasAuthorizationToken: z.boolean(),
})

export const ConnectorBlueprintSummary = z.object({
    id: z.string(),
    identifier: z.string(),
    connectorName: z.string(),
    displayName: z.string(),
    description: z.string(),
    iconColor: z.string(),
    logoUrl: z.string(),
    owner: BlueprintPerson.nullable(),
    collaboratorIds: z.array(z.string()),
    state: z.enum(BlueprintConnectorState),
    currentVersion: z.string().nullable(),
    pendingChanges: z.number(),
    operationCount: z.number(),
    triggerCount: z.number(),
    created: z.string(),
    updated: z.string(),
})

export const ConnectorBlueprintDetail = ConnectorBlueprintSummary.extend({
    definition: ConnectorBlueprintDefinition,
    publishedDefinition: z.nullable(ConnectorBlueprintDefinition),
    collaborators: z.array(BlueprintPerson),
    canManage: z.boolean(),
    authStatus: BlueprintAuthStatus,
    versions: z.array(BlueprintVersionView),
    changes: z.array(BlueprintChangeView),
    issues: z.array(BlueprintIssueView),
    debugRecords: z.array(BlueprintDebugRecord),
    usage: z.object({ workflows: z.number(), connections: z.number() }),
})

export const ListConnectorBlueprintsQuery = z.object({
    filter: z.enum(ConnectorBlueprintListFilter).optional(),
})

export const CreateConnectorBlueprintRequest = z.object({
    displayName: z.string().trim().min(1, 'formErrors.required').max(BLUEPRINT_LIMITS.name, 'Name must be 30 characters or fewer'),
    identifier: z.string().trim().min(1, 'formErrors.required').max(BLUEPRINT_LIMITS.identifier, 'Identifier must be 40 characters or fewer').regex(/^[a-z][a-z0-9_]*$/, 'Start with a lowercase letter and use only lowercase letters, digits and underscores'),
    description: z.string().max(BLUEPRINT_LIMITS.description, 'Description must be 200 characters or fewer'),
    iconColor: z.string(),
    presetId: z.string().nullable(),
})

export const PreviewOpenApiBlueprintRequest = z.object({
    document: z.string().min(1, 'formErrors.required'),
})

export const OpenApiBlueprintPreview = z.object({
    title: z.string(),
    description: z.string(),
    baseUrl: z.string(),
    identifier: z.string(),
    operations: z.array(z.object({
        key: z.string(),
        name: z.string(),
        method: z.enum(BlueprintHttpMethod),
        path: z.string(),
        inputCount: z.number(),
    })),
})

export const ImportOpenApiBlueprintRequest = CreateConnectorBlueprintRequest.omit({ presetId: true }).extend({
    document: z.string().min(1, 'formErrors.required'),
})

export const UpdateConnectorBlueprintRequest = z.object({
    definition: ConnectorBlueprintDefinition,
})

export const UpdateBlueprintCollaboratorsRequest = z.object({
    collaboratorIds: z.array(z.string()),
})

export const TransferBlueprintOwnershipRequest = z.object({
    ownerId: z.string().min(1, 'formErrors.required'),
})

export const SaveBlueprintAuthTestDataRequest = z.object({
    values: z.record(z.string(), z.string()),
})

export const RunBlueprintAuthTestRequest = z.object({
    kind: z.enum(BlueprintTestKind),
    operationKey: z.string().nullable(),
    projectId: z.string().nullable(),
    code: z.string().nullable(),
    redirectUrl: z.string().nullable(),
    codeVerifier: z.string().nullable(),
})

export const DebugBlueprintOperationRequest = z.object({
    operationKey: z.string().min(1, 'formErrors.required'),
    input: z.record(z.string(), z.unknown()),
    projectId: z.string().nullable(),
})

export const BlueprintDebugResult = z.object({
    success: z.boolean(),
    status: z.number(),
    durationMs: z.number(),
    at: z.string(),
    request: z.string(),
    response: z.unknown(),
    log: z.array(z.string()),
    errorMessage: z.string().nullable(),
})

export const SaveBlueprintDebugRecordRequest = z.object({
    operationKey: z.string().min(1, 'formErrors.required'),
    input: z.record(z.string(), z.unknown()),
    success: z.boolean(),
    status: z.number(),
    durationMs: z.number(),
})

export const PublishConnectorBlueprintRequest = z.object({
    changeIds: z.array(z.string()).min(1, 'Select at least one change'),
    mode: z.enum(BlueprintPublishMode),
    version: z.string().nullable(),
    rollout: z.enum(BlueprintRollout),
    canaryProjectIds: z.array(z.string()),
    description: z.string().trim().min(1, 'formErrors.required').max(BLUEPRINT_LIMITS.versionDescription, 'Version description must be 300 characters or fewer'),
})

export const ChangeBlueprintVersionStatusRequest = z.object({
    action: z.enum(BlueprintVersionAction),
})

export const UpdateBlueprintCanaryRequest = z.object({
    projectIds: z.array(z.string()).min(1, 'Select at least one project'),
})

export const BlueprintProjectOption = z.object({
    id: z.string(),
    name: z.string(),
    member: z.boolean(),
})

export type BlueprintTestResult = z.infer<typeof BlueprintTestResult>
export type BlueprintAuthState = z.infer<typeof BlueprintAuthState>
export type BlueprintDebugRecord = z.infer<typeof BlueprintDebugRecord>
export type BlueprintDraftBuild = z.infer<typeof BlueprintDraftBuild>
export type ConnectorBlueprint = z.infer<typeof ConnectorBlueprint>
export type BlueprintVersionUpdate = z.infer<typeof BlueprintVersionUpdate>
export type ConnectorBlueprintVersion = z.infer<typeof ConnectorBlueprintVersion>
export type BlueprintPerson = z.infer<typeof BlueprintPerson>
export type BlueprintChangeView = z.infer<typeof BlueprintChangeView>
export type BlueprintIssueView = z.infer<typeof BlueprintIssueView>
export type BlueprintVersionView = z.infer<typeof BlueprintVersionView>
export type BlueprintAuthStatus = z.infer<typeof BlueprintAuthStatus>
export type ConnectorBlueprintSummary = z.infer<typeof ConnectorBlueprintSummary>
export type ConnectorBlueprintDetail = z.infer<typeof ConnectorBlueprintDetail>
export type ListConnectorBlueprintsQuery = z.infer<typeof ListConnectorBlueprintsQuery>
export type CreateConnectorBlueprintRequest = z.infer<typeof CreateConnectorBlueprintRequest>
export type PreviewOpenApiBlueprintRequest = z.infer<typeof PreviewOpenApiBlueprintRequest>
export type OpenApiBlueprintPreview = z.infer<typeof OpenApiBlueprintPreview>
export type ImportOpenApiBlueprintRequest = z.infer<typeof ImportOpenApiBlueprintRequest>
export type UpdateConnectorBlueprintRequest = z.infer<typeof UpdateConnectorBlueprintRequest>
export type UpdateBlueprintCollaboratorsRequest = z.infer<typeof UpdateBlueprintCollaboratorsRequest>
export type TransferBlueprintOwnershipRequest = z.infer<typeof TransferBlueprintOwnershipRequest>
export type SaveBlueprintAuthTestDataRequest = z.infer<typeof SaveBlueprintAuthTestDataRequest>
export type RunBlueprintAuthTestRequest = z.infer<typeof RunBlueprintAuthTestRequest>
export type DebugBlueprintOperationRequest = z.infer<typeof DebugBlueprintOperationRequest>
export type BlueprintDebugResult = z.infer<typeof BlueprintDebugResult>
export type SaveBlueprintDebugRecordRequest = z.infer<typeof SaveBlueprintDebugRecordRequest>
export type PublishConnectorBlueprintRequest = z.infer<typeof PublishConnectorBlueprintRequest>
export type ChangeBlueprintVersionStatusRequest = z.infer<typeof ChangeBlueprintVersionStatusRequest>
export type UpdateBlueprintCanaryRequest = z.infer<typeof UpdateBlueprintCanaryRequest>
export type BlueprintProjectOption = z.infer<typeof BlueprintProjectOption>
