import { isNil, PlatformId, WorkspaceId } from '@fema/core-utils'
import { ApplicationEventName, FileType, PopulatedWorkflow, Workflow, WorkflowOperationRequest, WorkflowOperationType, WorkflowStatus, WorkflowVersion } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { applicationEvents, MetaInformation } from '../../helper/application-events'
import { triggerSourceService } from '../../trigger/trigger-source/trigger-source-service'
import { sampleDataService } from '../step-run/sample-data.service'

export const workflowSideEffects = (log: FastifyBaseLogger) => ({
    async preUpdateStatus({
        newStatus,
        workflowToUpdate,
        publishedWorkflowVersion,
        templateId,
        isRepublish,
    }: PreUpdateStatusParams): Promise<void> {
        switch (newStatus) {
            case WorkflowStatus.ENABLED: {
                await triggerSourceService(log).enable({
                    workflowVersion: publishedWorkflowVersion,
                    workspaceId: workflowToUpdate.workspaceId,
                    simulate: false,
                    templateId,
                    isRepublish,
                })
                break
            }
            case WorkflowStatus.DISABLED: {
                await triggerSourceService(log).disable({
                    workflowId: publishedWorkflowVersion.workflowId,
                    workspaceId: workflowToUpdate.workspaceId,
                    simulate: false,
                    ignoreError: false,
                    templateId,
                })
                break
            }
        }
    },

    async preDelete({ workflowToDelete }: PreDeleteParams): Promise<void> {
        if (
            workflowToDelete.status === WorkflowStatus.DISABLED ||
            isNil(workflowToDelete.publishedVersionId)
        ) {
            return
        }
        await triggerSourceService(log).disable({
            workflowId: workflowToDelete.id,
            workspaceId: workflowToDelete.workspaceId,
            simulate: false,
            ignoreError: true,
        })

        await sampleDataService(log).deleteForWorkflow({
            workspaceId: workflowToDelete.workspaceId,
            workflowId: workflowToDelete.id,
            fileType: FileType.SAMPLE_DATA,
        })

        await sampleDataService(log).deleteForWorkflow({
            workspaceId: workflowToDelete.workspaceId,
            workflowId: workflowToDelete.id,
            fileType: FileType.SAMPLE_DATA_INPUT,
        })
    },

    onCreated({ workflow, ...meta }: WorkflowEventParams): void {
        applicationEvents(log).sendUserEvent(meta, {
            action: ApplicationEventName.WORKFLOW_CREATED,
            data: {
                workflow,
            },
        })
    },

    onOperationApplied({ workflow, previousVersion, previousStatus, operation, ...meta }: OnOperationAppliedParams): void {
        applicationEvents(log).sendUserEvent(meta, {
            action: ApplicationEventName.WORKFLOW_UPDATED,
            data: {
                workflow: {
                    id: workflow.id,
                    externalId: workflow.externalId,
                    created: workflow.created,
                    updated: workflow.updated,
                },
                request: operation,
                workflowVersion: previousVersion,
            },
        })
        for (const action of lifecycleActions({ operation, previousStatus, newStatus: workflow.status })) {
            applicationEvents(log).sendUserEvent(meta, {
                action,
                data: {
                    workflow,
                    workflowVersion: workflow.version,
                },
            })
        }
    },

    onDeleted({ workflow, ...meta }: WorkflowEventParams): void {
        applicationEvents(log).sendUserEvent(meta, {
            action: ApplicationEventName.WORKFLOW_DELETED,
            data: {
                workflow,
                workflowVersion: workflow.version,
            },
        })
    },

    onDisabledByWorker({ workflow, workspaceId, platformId }: OnDisabledByWorkerParams): void {
        applicationEvents(log).sendWorkerEvent({
            workspaceId,
            platformId,
            action: ApplicationEventName.WORKFLOW_DEACTIVATED,
            data: {
                workflow,
                workflowVersion: workflow.version,
            },
        })
    },
})

function lifecycleActions({ operation, previousStatus, newStatus }: LifecycleActionsParams): ApplicationEventName[] {
    const published = operation.type === WorkflowOperationType.LOCK_AND_PUBLISH
    const changedStatus = (published || operation.type === WorkflowOperationType.CHANGE_STATUS) && newStatus !== previousStatus
    return [
        ...(published ? [ApplicationEventName.WORKFLOW_PUBLISHED] : []),
        ...(changedStatus ? [newStatus === WorkflowStatus.ENABLED ? ApplicationEventName.WORKFLOW_ACTIVATED : ApplicationEventName.WORKFLOW_DEACTIVATED] : []),
    ]
}

type PreUpdateStatusParams = {
    workflowToUpdate: Workflow
    publishedWorkflowVersion: WorkflowVersion
    newStatus: WorkflowStatus
    templateId?: string
    isRepublish?: boolean
}


type PreDeleteParams = {
    workflowToDelete: Workflow
}

type WorkflowEventParams = MetaInformation & {
    workflow: PopulatedWorkflow
}

type OnOperationAppliedParams = WorkflowEventParams & {
    previousVersion: WorkflowVersion
    previousStatus: WorkflowStatus
    operation: WorkflowOperationRequest
}

type OnDisabledByWorkerParams = {
    workflow: PopulatedWorkflow
    workspaceId: WorkspaceId
    platformId: PlatformId
}

type LifecycleActionsParams = {
    operation: WorkflowOperationRequest
    previousStatus: WorkflowStatus
    newStatus: WorkflowStatus
}
