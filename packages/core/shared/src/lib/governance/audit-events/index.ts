import { BaseModelSchema, DateOrString, Nullable, OptionalArrayFromQuery } from '@fema-ipaas/core-utils'
import { Folder, Workflow, WorkflowOperationRequest, WorkflowOperationType, WorkflowVersion } from '@fema-ipaas/workflow-core'
import { z } from 'zod'
import { UserWithMetaInformation } from '../../core/user/user'
export const ListAuditEventsRequest = z.object({
    limit: z.coerce.number().optional(),
    cursor: z.string().optional(),
    action: OptionalArrayFromQuery(z.string()),
    workspaceId: OptionalArrayFromQuery(z.string()),
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
}

const BaseAuditEventProps = {
    ...BaseModelSchema,
    tenantId: z.string(),
    workspaceId: z.string().optional(),
    workspaceDisplayName: z.string().optional(),
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
    workspace: z.object({
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
    workspace: z.object({
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
    workspace: z.object({
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
    workspace: z.object({
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
        workspace: z.object({
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
        workspace: z.object({
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
        workspace: z.object({
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
    workspace: z.object({
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
            return `User ${event.data.member.userId} was removed from the workspace`
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

