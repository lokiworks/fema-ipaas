import { BaseModelSchema, DateOrString, isNil, Nullable, OptionalArrayFromQuery } from '@fema-ipaas/core-utils'
import { Folder, Workflow, WorkflowOperationRequest, WorkflowOperationType, WorkflowVersion } from '@fema-ipaas/workflow-core'
import { z } from 'zod'
import { UserWithMetaInformation } from '../../core/user/user'
export const ListAuditEventsRequest = z.object({
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    action: OptionalArrayFromQuery(z.string()),
    projectId: OptionalArrayFromQuery(z.string()),
    userId: z.string().optional(),
    createdBefore: z.string().optional(),
    createdAfter: z.string().optional(),
})

export type ListAuditEventsRequest = z.infer<typeof ListAuditEventsRequest>

const UserMeta = UserWithMetaInformation.pick({ email: true, id: true, firstName: true, lastName: true })

export enum ApplicationEventName {
    WORKFLOW_CREATED = 'workflow.created',
    WORKFLOW_DELETED = 'workflow.deleted',
    WORKFLOW_UPDATED = 'workflow.updated',
    WORKFLOW_PUBLISHED = 'workflow.published',
    WORKFLOW_ACTIVATED = 'workflow.activated',
    WORKFLOW_DEACTIVATED = 'workflow.deactivated',
    EXECUTION_RESUMED = 'workflow.run.resumed',
    EXECUTION_STARTED = 'workflow.run.started',
    EXECUTION_FINISHED = 'workflow.run.finished',
    EXECUTION_RETRIED = 'workflow.run.retried',
    FOLDER_CREATED = 'folder.created',
    FOLDER_UPDATED = 'folder.updated',
    FOLDER_DELETED = 'folder.deleted',
    CONNECTION_UPSERTED = 'connection.upserted',
    CONNECTION_DELETED = 'connection.deleted',
    VARIABLE_UPSERTED = 'variable.upserted',
    VARIABLE_DELETED = 'variable.deleted',
    VARIABLE_VALUE_REVEALED = 'variable.value.revealed',
    USER_SIGNED_UP = 'user.signed.up',
    USER_SIGNED_IN = 'user.signed.in',
    USER_PASSWORD_RESET = 'user.password.reset',
    USER_EMAIL_VERIFIED = 'user.email.verified',
    CONNECTOR_PUBLISHED = 'connector.published',
    MEMBER_ADDED = 'member.added',
    MEMBER_REMOVED = 'member.removed',
    EXECUTION_PAYLOAD_REVEALED = 'workflow.run.payload.revealed',
    ISSUE_REPLAYED = 'issue.replayed',
    RUNS_RERUN = 'workflow.runs.rerun',
    PRIVACY_SETTINGS_UPDATED = 'privacy.settings.updated',
    PERSONAL_DATA_ERASURE = 'privacy.personal_data.erasure',
    AGENT_APPROVAL_DECIDED = 'agent.approval.decided',
    CONNECTION_SHARE_UPDATED = 'connection.share.updated',
    MCP_TOOL_TRIED = 'mcp.tool.tried',
    CONNECTOR_DEMAND_SUBMITTED = 'connector.demand.submitted',
    MCP_SERVICE_CHANGED = 'mcp.service.changed',
    TENANT_USERS_INVITED = 'tenant.users.invited',
    TENANT_USER_ACCESS_CHANGED = 'tenant.user.access.changed',
    TENANT_USER_REMOVED = 'tenant.user.removed',
    TENANT_USER_PASSWORD_RESET = 'tenant.user.password.reset',
    MODULE_ACCESS_REQUEST_DECIDED = 'tenant.module.request.decided',
    MODULE_ACCESS_SETTINGS_UPDATED = 'tenant.module.settings.updated',
    RESOURCES_OWNERSHIP_TRANSFERRED = 'tenant.resources.transferred',
    LOGIN_SETTINGS_UPDATED = 'tenant.login.settings.updated',
    WORKER_STATE_CHANGED = 'tenant.worker.state.changed',
    AUDIT_LOG_EXPORTED = 'tenant.audit.exported',
    PROJECT_LIMITS_UPDATED = 'tenant.project.limits.updated',
    DATA_STORE_CREATED = 'data_store.created',
    DATA_STORE_UPDATED = 'data_store.updated',
    DATA_STORE_DELETED = 'data_store.deleted',
    DATA_STORE_CLEARED = 'data_store.cleared',
    DATA_STORE_RECORD_DELETED = 'data_store.record.deleted',
    PERSONAL_ACCESS_TOKEN_CREATED = 'user.access_token.created',
    PERSONAL_ACCESS_TOKEN_REVOKED = 'user.access_token.revoked',
}

const BaseAuditEventProps = {
    ...BaseModelSchema,
    tenantId: z.string(),
    projectId: z.string().optional(),
    projectDisplayName: z.string().optional(),
    userId: z.string().optional(),
    userEmail: z.string().optional(),
    ip: z.string().optional(),
}

const ConnectionEventData = z.object({
    connection: z.object({
        displayName: z.string(),
        externalId: z.string(),
        connectorName: z.string(),
        status: z.string(),
        type: z.string(),
        id: z.string(),
        created: DateOrString,
        updated: DateOrString,
    }),
    project: z.object({
        displayName: z.string(),
    }).optional(),
})

export const ConnectionEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.CONNECTION_DELETED),
        z.literal(ApplicationEventName.CONNECTION_UPSERTED),
    ]),
    data: ConnectionEventData,
})
export type ConnectionEvent = z.infer<typeof ConnectionEvent>

export const ConnectionUpsertedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.CONNECTION_UPSERTED),
    data: ConnectionEventData,
})
export type ConnectionUpsertedEvent = z.infer<typeof ConnectionUpsertedEvent>

export const ConnectionDeletedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.CONNECTION_DELETED),
    data: ConnectionEventData,
})
export type ConnectionDeletedEvent = z.infer<typeof ConnectionDeletedEvent>

const VariableEventData = z.object({
    variable: z.object({
        id: z.string(),
        name: z.string(),
        created: DateOrString,
        updated: DateOrString,
    }),
    project: z.object({
        displayName: z.string(),
    }).optional(),
})

export const VariableEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.VARIABLE_UPSERTED),
        z.literal(ApplicationEventName.VARIABLE_DELETED),
        z.literal(ApplicationEventName.VARIABLE_VALUE_REVEALED),
    ]),
    data: VariableEventData,
})
export type VariableEvent = z.infer<typeof VariableEvent>

export const VariableUpsertedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.VARIABLE_UPSERTED),
    data: VariableEventData,
})
export type VariableUpsertedEvent = z.infer<typeof VariableUpsertedEvent>

export const VariableDeletedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.VARIABLE_DELETED),
    data: VariableEventData,
})
export type VariableDeletedEvent = z.infer<typeof VariableDeletedEvent>

export const VariableValueRevealedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.VARIABLE_VALUE_REVEALED),
    data: VariableEventData,
})
export type VariableValueRevealedEvent = z.infer<typeof VariableValueRevealedEvent>

const FolderEventData = z.object({
    folder: Folder.pick({ id: true, displayName: true, created: true, updated: true }),
    project: z.object({
        displayName: z.string(),
    }).optional(),
})

export const FolderEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.FOLDER_UPDATED),
        z.literal(ApplicationEventName.FOLDER_CREATED),
        z.literal(ApplicationEventName.FOLDER_DELETED),
    ]),
    data: FolderEventData,
})

export type FolderEvent = z.infer<typeof FolderEvent>

export const FolderCreatedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.FOLDER_CREATED),
    data: FolderEventData,
})
export type FolderCreatedEvent = z.infer<typeof FolderCreatedEvent>

export const FolderUpdatedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.FOLDER_UPDATED),
    data: FolderEventData,
})
export type FolderUpdatedEvent = z.infer<typeof FolderUpdatedEvent>

export const FolderDeletedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.FOLDER_DELETED),
    data: FolderEventData,
})
export type FolderDeletedEvent = z.infer<typeof FolderDeletedEvent>

const ExecutionEventData = z.object({
    execution: z.object({
        id: z.string(),
        startTime: z.string().nullish(),
        finishTime: z.string().nullish(),
        duration: z.number().optional(),
        triggeredBy: z.string().optional(),
        environment: z.string(),
        workflowId: z.string(),
        workflowVersionId: z.string(),
        stepNameToTest: z.string().nullish(),
        workflowDisplayName: z.string().optional(),
        status: z.string(),
    }),
    project: z.object({
        displayName: z.string(),
    }).optional(),
})

export const ExecutionEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.EXECUTION_STARTED),
        z.literal(ApplicationEventName.EXECUTION_FINISHED),
        z.literal(ApplicationEventName.EXECUTION_RESUMED),
        z.literal(ApplicationEventName.EXECUTION_RETRIED),
    ]),
    data: ExecutionEventData,
})
export type ExecutionEvent = z.infer<typeof ExecutionEvent>

export const ExecutionStartedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.EXECUTION_STARTED),
    data: ExecutionEventData,
})
export type ExecutionStartedEvent = z.infer<typeof ExecutionStartedEvent>

export const ExecutionFinishedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.EXECUTION_FINISHED),
    data: ExecutionEventData,
})
export type ExecutionFinishedEvent = z.infer<typeof ExecutionFinishedEvent>

export const ExecutionResumedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.EXECUTION_RESUMED),
    data: ExecutionEventData,
})
export type ExecutionResumedEvent = z.infer<typeof ExecutionResumedEvent>

export const ExecutionRetriedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.EXECUTION_RETRIED),
    data: ExecutionEventData,
})
export type ExecutionRetriedEvent = z.infer<typeof ExecutionRetriedEvent>

export const WorkflowCreatedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.WORKFLOW_CREATED),
    data: z.object({
        workflow: Workflow.pick({ id: true, externalId: true, created: true, updated: true }),
        project: z.object({
            displayName: z.string(),
            externalId: Nullable(z.string()),
        }).optional(),
    }),
})

export type WorkflowCreatedEvent = z.infer<typeof WorkflowCreatedEvent>

export const WorkflowDeletedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.WORKFLOW_DELETED),
    data: z.object({
        workflow: Workflow.pick({ id: true, externalId: true, created: true, updated: true }),
        workflowVersion: WorkflowVersion.pick({
            id: true,
            displayName: true,
            workflowId: true,
            created: true,
            updated: true,
        }),
        project: z.object({
            displayName: z.string(),
            externalId: Nullable(z.string()),
        }).optional(),
    }),
})

export type WorkflowDeletedEvent = z.infer<typeof WorkflowDeletedEvent>

export const WorkflowUpdatedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.WORKFLOW_UPDATED),
    data: z.object({
        workflow: Workflow.pick({ id: true, externalId: true, created: true, updated: true }),
        workflowVersion: WorkflowVersion.pick({
            id: true,
            displayName: true,
            workflowId: true,
            created: true,
            updated: true,
        }),
        request: WorkflowOperationRequest,
        project: z.object({
            displayName: z.string(),
            externalId: Nullable(z.string()),
        }).optional(),
    }),
})

export type WorkflowUpdatedEvent = z.infer<typeof WorkflowUpdatedEvent>

const WorkflowLifecycleEventData = z.object({
    workflow: Workflow.pick({ id: true, externalId: true, created: true, updated: true }),
    workflowVersion: WorkflowVersion.pick({
        id: true,
        displayName: true,
        workflowId: true,
        created: true,
        updated: true,
    }),
    project: z.object({
        displayName: z.string(),
        externalId: Nullable(z.string()),
    }).optional(),
})

export const WorkflowPublishedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.WORKFLOW_PUBLISHED),
    data: WorkflowLifecycleEventData,
})

export type WorkflowPublishedEvent = z.infer<typeof WorkflowPublishedEvent>

export const WorkflowActivatedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.WORKFLOW_ACTIVATED),
    data: WorkflowLifecycleEventData,
})

export type WorkflowActivatedEvent = z.infer<typeof WorkflowActivatedEvent>

export const WorkflowDeactivatedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.WORKFLOW_DEACTIVATED),
    data: WorkflowLifecycleEventData,
})

export type WorkflowDeactivatedEvent = z.infer<typeof WorkflowDeactivatedEvent>

const ConnectorEventData = z.object({
    connector: z.object({
        name: z.string(),
        version: z.string(),
    }),
})

export const ConnectorPublishedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.CONNECTOR_PUBLISHED),
    data: ConnectorEventData,
})
export type ConnectorPublishedEvent = z.infer<typeof ConnectorPublishedEvent>

const MemberEventData = z.object({
    member: z.object({
        userId: z.string(),
        role: z.string(),
    }),
})

export const MemberEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.MEMBER_ADDED),
        z.literal(ApplicationEventName.MEMBER_REMOVED),
    ]),
    data: MemberEventData,
})
export type MemberEvent = z.infer<typeof MemberEvent>

export const MemberAddedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.MEMBER_ADDED),
    data: MemberEventData,
})
export type MemberAddedEvent = z.infer<typeof MemberAddedEvent>

export const MemberRemovedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.MEMBER_REMOVED),
    data: MemberEventData,
})
export type MemberRemovedEvent = z.infer<typeof MemberRemovedEvent>

const AuthenticationEventData = z.object({
    user: UserMeta.optional(),
})

export const AuthenticationEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.USER_SIGNED_IN),
        z.literal(ApplicationEventName.USER_PASSWORD_RESET),
        z.literal(ApplicationEventName.USER_EMAIL_VERIFIED),
    ]),
    data: AuthenticationEventData,
})

export type AuthenticationEvent = z.infer<typeof AuthenticationEvent>

export const UserSignedInEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.USER_SIGNED_IN),
    data: AuthenticationEventData,
})
export type UserSignedInEvent = z.infer<typeof UserSignedInEvent>

export const UserPasswordResetEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.USER_PASSWORD_RESET),
    data: AuthenticationEventData,
})
export type UserPasswordResetEvent = z.infer<typeof UserPasswordResetEvent>

export const UserEmailVerifiedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.USER_EMAIL_VERIFIED),
    data: AuthenticationEventData,
})
export type UserEmailVerifiedEvent = z.infer<typeof UserEmailVerifiedEvent>

export const SignUpEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.USER_SIGNED_UP),
    data: z.object({
        source: z.union([
            z.literal('credentials'),
            z.literal('sso'),
            z.literal('managed'),
        ]),
        user: UserMeta.optional(),
    }),
})
export type SignUpEvent = z.infer<typeof SignUpEvent>

export const ExecutionPayloadRevealedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.EXECUTION_PAYLOAD_REVEALED),
    data: z.object({
        execution: z.object({
            id: z.string(),
            workflowId: z.string(),
        }),
        stepName: z.string(),
        reason: z.string().optional(),
    }),
})
export type ExecutionPayloadRevealedEvent = z.infer<typeof ExecutionPayloadRevealedEvent>

export const IssueReplayedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.ISSUE_REPLAYED),
    data: z.object({
        issue: z.object({
            id: z.string(),
            title: z.string(),
        }),
        strategy: z.string(),
        count: z.number(),
    }),
})
export type IssueReplayedEvent = z.infer<typeof IssueReplayedEvent>

export const RunsRerunEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.RUNS_RERUN),
    data: z.object({
        strategy: z.string(),
        count: z.number(),
        executionIds: z.array(z.string()),
    }),
})
export type RunsRerunEvent = z.infer<typeof RunsRerunEvent>

export const PrivacySettingsUpdatedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.PRIVACY_SETTINGS_UPDATED),
    data: z.object({
        logRetentionDays: z.number(),
        payloadLevel: z.string(),
    }),
})
export type PrivacySettingsUpdatedEvent = z.infer<typeof PrivacySettingsUpdatedEvent>

export const PersonalDataErasureEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.PERSONAL_DATA_ERASURE),
    data: z.object({
        request: z.object({
            id: z.string(),
            kind: z.string(),
            valueHint: z.string(),
            reason: z.string(),
        }),
        phase: z.enum(['REQUESTED', 'CONFIRMED', 'CANCELED']),
        matchedRuns: z.number(),
    }),
})
export type PersonalDataErasureEvent = z.infer<typeof PersonalDataErasureEvent>

export const AgentApprovalDecidedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.AGENT_APPROVAL_DECIDED),
    data: z.object({
        approval: z.object({
            id: z.string(),
            tool: z.string(),
            executionId: z.string(),
        }),
        approved: z.boolean(),
        comment: z.string().nullable(),
    }),
})
export type AgentApprovalDecidedEvent = z.infer<typeof AgentApprovalDecidedEvent>

export const ConnectionShareUpdatedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.CONNECTION_SHARE_UPDATED),
    data: z.object({
        connection: z.object({
            id: z.string(),
            displayName: z.string(),
        }),
        change: z.enum(['ADDED', 'UPDATED', 'REMOVED', 'PROJECT_MEMBERS']),
        targetUser: z.object({
            id: z.string(),
            email: z.string(),
        }).nullable(),
        permission: z.string().nullable(),
    }),
})
export type ConnectionShareUpdatedEvent = z.infer<typeof ConnectionShareUpdatedEvent>

export const McpToolTriedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.MCP_TOOL_TRIED),
    data: z.object({
        server: z.object({
            id: z.string(),
            displayName: z.string(),
        }),
        toolName: z.string(),
        success: z.boolean(),
    }),
})
export type McpToolTriedEvent = z.infer<typeof McpToolTriedEvent>

export const ConnectorDemandSubmittedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.CONNECTOR_DEMAND_SUBMITTED),
    data: z.object({
        demand: z.object({
            id: z.string(),
            appName: z.string(),
        }),
    }),
})
export type ConnectorDemandSubmittedEvent = z.infer<typeof ConnectorDemandSubmittedEvent>

export const McpServiceChangedEvent = z.object({
    ...BaseAuditEventProps,
    action: z.literal(ApplicationEventName.MCP_SERVICE_CHANGED),
    data: z.object({
        service: z.object({
            id: z.string(),
            name: z.string(),
        }),
        change: z.enum(['CREATED', 'UPDATED', 'TOOLS_UPDATED', 'CONNECTIONS_UPDATED', 'AVAILABILITY_UPDATED', 'PUBLISHED', 'PAUSED', 'ENABLED', 'LISTED', 'UNLISTED', 'KEY_RESET', 'TRANSFERRED', 'DELETED', 'OBTAINED', 'TOOL_DEBUGGED']),
        detail: z.string().nullable(),
    }),
})
export type McpServiceChangedEvent = z.infer<typeof McpServiceChangedEvent>

export const TenantAdminEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.TENANT_USERS_INVITED),
        z.literal(ApplicationEventName.TENANT_USER_ACCESS_CHANGED),
        z.literal(ApplicationEventName.TENANT_USER_REMOVED),
        z.literal(ApplicationEventName.TENANT_USER_PASSWORD_RESET),
        z.literal(ApplicationEventName.MODULE_ACCESS_REQUEST_DECIDED),
        z.literal(ApplicationEventName.MODULE_ACCESS_SETTINGS_UPDATED),
        z.literal(ApplicationEventName.RESOURCES_OWNERSHIP_TRANSFERRED),
        z.literal(ApplicationEventName.LOGIN_SETTINGS_UPDATED),
        z.literal(ApplicationEventName.WORKER_STATE_CHANGED),
        z.literal(ApplicationEventName.AUDIT_LOG_EXPORTED),
        z.literal(ApplicationEventName.PROJECT_LIMITS_UPDATED),
    ]),
    data: z.object({
        target: z.string(),
        detail: z.string().optional(),
    }),
})
export type TenantAdminEvent = z.infer<typeof TenantAdminEvent>

export const DataStoreEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.DATA_STORE_CREATED),
        z.literal(ApplicationEventName.DATA_STORE_UPDATED),
        z.literal(ApplicationEventName.DATA_STORE_DELETED),
        z.literal(ApplicationEventName.DATA_STORE_CLEARED),
        z.literal(ApplicationEventName.DATA_STORE_RECORD_DELETED),
    ]),
    data: z.object({
        dataStore: z.object({
            id: z.string(),
            name: z.string(),
        }),
        key: z.string().optional(),
        count: z.number().optional(),
    }),
})
export type DataStoreEvent = z.infer<typeof DataStoreEvent>

export const PersonalAccessTokenEvent = z.object({
    ...BaseAuditEventProps,
    action: z.union([
        z.literal(ApplicationEventName.PERSONAL_ACCESS_TOKEN_CREATED),
        z.literal(ApplicationEventName.PERSONAL_ACCESS_TOKEN_REVOKED),
    ]),
    data: z.object({
        token: z.object({
            id: z.string(),
            name: z.string(),
            expiresAt: z.string().nullable(),
        }),
    }),
})
export type PersonalAccessTokenEvent = z.infer<typeof PersonalAccessTokenEvent>

export const ApplicationEvent = z.union([
    ConnectionEvent,
    VariableEvent,
    WorkflowCreatedEvent,
    WorkflowDeletedEvent,
    WorkflowUpdatedEvent,
    WorkflowPublishedEvent,
    WorkflowActivatedEvent,
    WorkflowDeactivatedEvent,
    ExecutionEvent,
    AuthenticationEvent,
    FolderEvent,
    SignUpEvent,
    ConnectorPublishedEvent,
    MemberEvent,
    ExecutionPayloadRevealedEvent,
    IssueReplayedEvent,
    RunsRerunEvent,
    PrivacySettingsUpdatedEvent,
    PersonalDataErasureEvent,
    AgentApprovalDecidedEvent,
    ConnectionShareUpdatedEvent,
    McpToolTriedEvent,
    ConnectorDemandSubmittedEvent,
    McpServiceChangedEvent,
    TenantAdminEvent,
    DataStoreEvent,
    PersonalAccessTokenEvent,
])

export type ApplicationEvent = z.infer<typeof ApplicationEvent>

export function summarizeApplicationEvent(event: ApplicationEvent) {
    switch (event.action) {
        case ApplicationEventName.WORKFLOW_UPDATED: {
            return convertUpdateActionToDetails(event)
        }
        case ApplicationEventName.EXECUTION_STARTED:
            return `Workflow run ${event.data.execution.id} is started`
        case ApplicationEventName.EXECUTION_FINISHED: {
            return `Workflow run ${event.data.execution.id} is finished`
        }
        case ApplicationEventName.EXECUTION_RESUMED: {
            return `Workflow run ${event.data.execution.id} is resumed`
        }
        case ApplicationEventName.EXECUTION_RETRIED: {
            return `Workflow run ${event.data.execution.id} is retried from a failed step`
        }
        case ApplicationEventName.WORKFLOW_CREATED:
            return `Workflow ${event.data.workflow.id} is created`
        case ApplicationEventName.WORKFLOW_DELETED:
            return `Workflow ${event.data.workflow.id} (${event.data.workflowVersion.displayName}) is deleted`
        case ApplicationEventName.WORKFLOW_PUBLISHED:
            return `Workflow "${event.data.workflowVersion.displayName}" was published`
        case ApplicationEventName.WORKFLOW_ACTIVATED:
            return `Workflow "${event.data.workflowVersion.displayName}" was activated`
        case ApplicationEventName.WORKFLOW_DEACTIVATED:
            return `Workflow "${event.data.workflowVersion.displayName}" was deactivated`
        case ApplicationEventName.FOLDER_CREATED:
            return `${event.data.folder.displayName} is created`
        case ApplicationEventName.FOLDER_UPDATED:
            return `${event.data.folder.displayName} is updated`
        case ApplicationEventName.FOLDER_DELETED:
            return `${event.data.folder.displayName} is deleted`
        case ApplicationEventName.CONNECTION_UPSERTED:
            return `${event.data.connection.displayName} (${event.data.connection.externalId}) is updated`
        case ApplicationEventName.CONNECTION_DELETED:
            return `${event.data.connection.displayName} (${event.data.connection.externalId}) is deleted`
        case ApplicationEventName.VARIABLE_UPSERTED:
            return `Variable ${event.data.variable.name} is created or updated`
        case ApplicationEventName.VARIABLE_DELETED:
            return `Variable ${event.data.variable.name} is deleted`
        case ApplicationEventName.VARIABLE_VALUE_REVEALED:
            return `Variable ${event.data.variable.name} value was revealed`
        case ApplicationEventName.EXECUTION_PAYLOAD_REVEALED:
            return `Raw payload of step ${event.data.stepName} in run ${event.data.execution.id} was revealed`
        case ApplicationEventName.ISSUE_REPLAYED:
            return `${event.data.count} runs of issue "${event.data.issue.title}" were replayed`
        case ApplicationEventName.RUNS_RERUN:
            return `${event.data.count} runs were rerun (${event.data.strategy.toLowerCase()})`
        case ApplicationEventName.PRIVACY_SETTINGS_UPDATED:
            return 'Privacy settings were updated'
        case ApplicationEventName.AGENT_APPROVAL_DECIDED:
            return `Agent tool call ${event.data.approval.tool} in run ${event.data.approval.executionId} was ${event.data.approved ? 'approved' : 'rejected'}`
        case ApplicationEventName.CONNECTION_SHARE_UPDATED:
            return `Sharing of connection ${event.data.connection.displayName} changed (${event.data.change.toLowerCase()}${isNil(event.data.targetUser) ? '' : ` ${event.data.targetUser.email}`}${isNil(event.data.permission) ? '' : `: ${event.data.permission}`})`
        case ApplicationEventName.MCP_TOOL_TRIED:
            return `MCP tool ${event.data.toolName} of ${event.data.server.displayName} was tried${event.data.success ? '' : ' and failed'}`
        case ApplicationEventName.CONNECTOR_DEMAND_SUBMITTED:
            return `Connector request for ${event.data.demand.appName} was submitted`
        case ApplicationEventName.MCP_SERVICE_CHANGED:
            return `MCP service ${event.data.service.name}: ${event.data.change.toLowerCase()}${isNil(event.data.detail) ? '' : ` (${event.data.detail})`}`
        case ApplicationEventName.PERSONAL_DATA_ERASURE:
            return `Personal data erasure for ${event.data.request.valueHint}: ${event.data.phase.toLowerCase()} (${event.data.matchedRuns} runs)`
        case ApplicationEventName.USER_SIGNED_IN:
            return `User ${event.userEmail} signed in`
        case ApplicationEventName.USER_PASSWORD_RESET:
            return `User ${event.userEmail} reset password`
        case ApplicationEventName.USER_EMAIL_VERIFIED:
            return `User ${event.userEmail} verified email`
        case ApplicationEventName.USER_SIGNED_UP:
            return `User ${event.userEmail} signed up using email from ${event.data.source}`
        case ApplicationEventName.CONNECTOR_PUBLISHED:
            return `Connector ${event.data.connector.name}@${event.data.connector.version} was published`
        case ApplicationEventName.MEMBER_ADDED:
            return `User ${event.data.member.userId} was added as ${event.data.member.role}`
        case ApplicationEventName.MEMBER_REMOVED:
            return `User ${event.data.member.userId} was removed from the project`
        case ApplicationEventName.TENANT_USERS_INVITED:
        case ApplicationEventName.TENANT_USER_ACCESS_CHANGED:
        case ApplicationEventName.TENANT_USER_REMOVED:
        case ApplicationEventName.TENANT_USER_PASSWORD_RESET:
        case ApplicationEventName.MODULE_ACCESS_REQUEST_DECIDED:
        case ApplicationEventName.MODULE_ACCESS_SETTINGS_UPDATED:
        case ApplicationEventName.RESOURCES_OWNERSHIP_TRANSFERRED:
        case ApplicationEventName.LOGIN_SETTINGS_UPDATED:
        case ApplicationEventName.WORKER_STATE_CHANGED:
        case ApplicationEventName.AUDIT_LOG_EXPORTED:
        case ApplicationEventName.PROJECT_LIMITS_UPDATED:
            return isNil(event.data.detail) ? event.data.target : `${event.data.target}: ${event.data.detail}`
        case ApplicationEventName.DATA_STORE_CREATED:
            return `Data store "${event.data.dataStore.name}" was created`
        case ApplicationEventName.DATA_STORE_UPDATED:
            return `Data store "${event.data.dataStore.name}" was updated`
        case ApplicationEventName.DATA_STORE_DELETED:
            return `Data store "${event.data.dataStore.name}" was deleted`
        case ApplicationEventName.DATA_STORE_CLEARED:
            return `${event.data.count ?? 0} records in data store "${event.data.dataStore.name}" were cleared`
        case ApplicationEventName.DATA_STORE_RECORD_DELETED:
            return `Key "${event.data.key ?? ''}" was deleted from data store "${event.data.dataStore.name}"`
        case ApplicationEventName.PERSONAL_ACCESS_TOKEN_CREATED:
            return `Personal access token "${event.data.token.name}" was created`
        case ApplicationEventName.PERSONAL_ACCESS_TOKEN_REVOKED:
            return `Personal access token "${event.data.token.name}" was revoked`
    }
}

function convertUpdateActionToDetails(event: WorkflowUpdatedEvent) {
    switch (event.data.request.type) {
        case WorkflowOperationType.ADD_ACTION:
            return `Added action "${event.data.request.request.action.displayName}" to "${event.data.workflowVersion.displayName}" Workflow.`
        case WorkflowOperationType.UPDATE_ACTION:
            return `Updated action "${event.data.request.request.displayName}" in "${event.data.workflowVersion.displayName}" Workflow.`
        case WorkflowOperationType.DELETE_ACTION:
        {
            const request = event.data.request.request
            const names = request.names
            return `Deleted actions "${names.join(', ')}" from "${event.data.workflowVersion.displayName}" Workflow.`
        }
        case WorkflowOperationType.CHANGE_NAME:
            return `Renamed workflow "${event.data.workflowVersion.displayName}" to "${event.data.request.request.displayName}".`
        case WorkflowOperationType.LOCK_AND_PUBLISH:
            return `Locked and published workflow "${event.data.workflowVersion.displayName}" Workflow.`
        case WorkflowOperationType.USE_AS_DRAFT:
            return `Unlocked and unpublished workflow "${event.data.workflowVersion.displayName}" Workflow.`
        case WorkflowOperationType.MOVE_ACTION:
            return `Moved action "${event.data.request.request.name}" to after "${event.data.request.request.newParentStep}".`
        case WorkflowOperationType.LOCK_WORKFLOW:
            return `Locked workflow "${event.data.workflowVersion.displayName}" Workflow.`
        case WorkflowOperationType.CHANGE_STATUS:
            return `Changed status of workflow "${event.data.workflowVersion.displayName}" Workflow to "${event.data.request.request.status}".`
        case WorkflowOperationType.DUPLICATE_ACTION:
            return `Duplicated action "${event.data.request.request.stepName}" in "${event.data.workflowVersion.displayName}" Workflow.`
        case WorkflowOperationType.IMPORT_WORKFLOW:
            return `Imported workflow in "${event.data.request.request.displayName}" Workflow.`
        case WorkflowOperationType.UPDATE_TRIGGER:
            return `Updated trigger in "${event.data.workflowVersion.displayName}" Workflow to "${event.data.request.request.displayName}".`
        case WorkflowOperationType.CHANGE_FOLDER:
            return `Moved workflow "${event.data.workflowVersion.displayName}" to folder id ${event.data.request.request.folderId}.`
        case WorkflowOperationType.DELETE_BRANCH: {
            return `Deleted branch number ${
                event.data.request.request.branchIndex + 1
            } in workflow "${event.data.workflowVersion.displayName}" for the step "${
                event.data.request.request.stepName
            }".`
        }
        case WorkflowOperationType.SAVE_SAMPLE_DATA: {
            return `Saved sample data for step "${event.data.request.request.stepName}" in workflow "${event.data.workflowVersion.displayName}".`
        }
        case WorkflowOperationType.DUPLICATE_BRANCH: {
            return `Duplicated branch number ${
                event.data.request.request.branchIndex + 1
            } in workflow "${event.data.workflowVersion.displayName}" for the step "${
                event.data.request.request.stepName
            }".`
        }
        case WorkflowOperationType.ADD_BRANCH:
            return `Added branch number ${
                event.data.request.request.branchIndex + 1
            } in workflow "${event.data.workflowVersion.displayName}" for the step "${
                event.data.request.request.stepName
            }".`
        case WorkflowOperationType.SET_SKIP_ACTION:
        {
            const request = event.data.request.request
            const names = request.names
            return `Updated actions "${names.join(', ')}" in "${event.data.workflowVersion.displayName}" Workflow to skip.`
        }
        case WorkflowOperationType.UPDATE_METADATA:
            return `Updated metadata for workflow "${event.data.workflowVersion.displayName}".`
        case WorkflowOperationType.UPDATE_MINUTES_SAVED:
            return `Updated minutes saved for workflow "${event.data.workflowVersion.displayName}".`
        case WorkflowOperationType.UPDATE_OWNER:
            return `Updated owner for workflow "${event.data.workflowVersion.displayName}" to "${event.data.request.request.ownerId}".`
        case WorkflowOperationType.MOVE_BRANCH:
            return `Moved branch number ${
                event.data.request.request.sourceBranchIndex + 1
            } to ${
                event.data.request.request.targetBranchIndex + 1
            } in workflow "${event.data.workflowVersion.displayName}" for the step "${
                event.data.request.request.stepName
            }".`
        case WorkflowOperationType.ADD_NOTE:
            return `Added note to workflow "${event.data.workflowVersion.displayName}".`
        case WorkflowOperationType.UPDATE_NOTE:
            return `Updated note in workflow "${event.data.workflowVersion.displayName}".`
        case WorkflowOperationType.DELETE_NOTE:
            return `Deleted note in workflow "${event.data.workflowVersion.displayName}".`
        case WorkflowOperationType.UPDATE_SAMPLE_DATA_INFO:
            return `Updated sample data info for step "${event.data.request.request.stepName}" in workflow "${event.data.workflowVersion.displayName}".`
        case WorkflowOperationType.SET_JOIN_EDGES:
            return `Set ${event.data.request.request.joinEdges.length} join edge(s) in workflow "${event.data.workflowVersion.displayName}".`
    }
}

