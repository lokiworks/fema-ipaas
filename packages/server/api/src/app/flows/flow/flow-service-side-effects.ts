import { isNil, PlatformId, WorkspaceId } from '@fema/core-utils'
import { ApplicationEventName, FileType, Flow, FlowOperationRequest, FlowOperationType, FlowStatus, FlowVersion, PopulatedFlow } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { applicationEvents, MetaInformation } from '../../helper/application-events'
import { triggerSourceService } from '../../trigger/trigger-source/trigger-source-service'
import { sampleDataService } from '../step-run/sample-data.service'

export const flowSideEffects = (log: FastifyBaseLogger) => ({
    async preUpdateStatus({
        newStatus,
        flowToUpdate,
        publishedFlowVersion,
        templateId,
        isRepublish,
    }: PreUpdateStatusParams): Promise<void> {
        switch (newStatus) {
            case FlowStatus.ENABLED: {
                await triggerSourceService(log).enable({
                    flowVersion: publishedFlowVersion,
                    workspaceId: flowToUpdate.workspaceId,
                    simulate: false,
                    templateId,
                    isRepublish,
                })
                break
            }
            case FlowStatus.DISABLED: {
                await triggerSourceService(log).disable({
                    flowId: publishedFlowVersion.flowId,
                    workspaceId: flowToUpdate.workspaceId,
                    simulate: false,
                    ignoreError: false,
                    templateId,
                })
                break
            }
        }
    },

    async preDelete({ flowToDelete }: PreDeleteParams): Promise<void> {
        if (
            flowToDelete.status === FlowStatus.DISABLED ||
            isNil(flowToDelete.publishedVersionId)
        ) {
            return
        }
        await triggerSourceService(log).disable({
            flowId: flowToDelete.id,
            workspaceId: flowToDelete.workspaceId,
            simulate: false,
            ignoreError: true,
        })

        await sampleDataService(log).deleteForFlow({
            workspaceId: flowToDelete.workspaceId,
            flowId: flowToDelete.id,
            fileType: FileType.SAMPLE_DATA,
        })

        await sampleDataService(log).deleteForFlow({
            workspaceId: flowToDelete.workspaceId,
            flowId: flowToDelete.id,
            fileType: FileType.SAMPLE_DATA_INPUT,
        })
    },

    onCreated({ flow, ...meta }: FlowEventParams): void {
        applicationEvents(log).sendUserEvent(meta, {
            action: ApplicationEventName.FLOW_CREATED,
            data: {
                flow,
            },
        })
    },

    onOperationApplied({ flow, previousVersion, previousStatus, operation, ...meta }: OnOperationAppliedParams): void {
        applicationEvents(log).sendUserEvent(meta, {
            action: ApplicationEventName.FLOW_UPDATED,
            data: {
                flow: {
                    id: flow.id,
                    externalId: flow.externalId,
                    created: flow.created,
                    updated: flow.updated,
                },
                request: operation,
                flowVersion: previousVersion,
            },
        })
        for (const action of lifecycleActions({ operation, previousStatus, newStatus: flow.status })) {
            applicationEvents(log).sendUserEvent(meta, {
                action,
                data: {
                    flow,
                    flowVersion: flow.version,
                },
            })
        }
    },

    onDeleted({ flow, ...meta }: FlowEventParams): void {
        applicationEvents(log).sendUserEvent(meta, {
            action: ApplicationEventName.FLOW_DELETED,
            data: {
                flow,
                flowVersion: flow.version,
            },
        })
    },

    onDisabledByWorker({ flow, workspaceId, platformId }: OnDisabledByWorkerParams): void {
        applicationEvents(log).sendWorkerEvent({
            workspaceId,
            platformId,
            action: ApplicationEventName.FLOW_DEACTIVATED,
            data: {
                flow,
                flowVersion: flow.version,
            },
        })
    },
})

function lifecycleActions({ operation, previousStatus, newStatus }: LifecycleActionsParams): ApplicationEventName[] {
    const published = operation.type === FlowOperationType.LOCK_AND_PUBLISH
    const changedStatus = (published || operation.type === FlowOperationType.CHANGE_STATUS) && newStatus !== previousStatus
    return [
        ...(published ? [ApplicationEventName.FLOW_PUBLISHED] : []),
        ...(changedStatus ? [newStatus === FlowStatus.ENABLED ? ApplicationEventName.FLOW_ACTIVATED : ApplicationEventName.FLOW_DEACTIVATED] : []),
    ]
}

type PreUpdateStatusParams = {
    flowToUpdate: Flow
    publishedFlowVersion: FlowVersion
    newStatus: FlowStatus
    templateId?: string
    isRepublish?: boolean
}


type PreDeleteParams = {
    flowToDelete: Flow
}

type FlowEventParams = MetaInformation & {
    flow: PopulatedFlow
}

type OnOperationAppliedParams = FlowEventParams & {
    previousVersion: FlowVersion
    previousStatus: FlowStatus
    operation: FlowOperationRequest
}

type OnDisabledByWorkerParams = {
    flow: PopulatedFlow
    workspaceId: WorkspaceId
    platformId: PlatformId
}

type LifecycleActionsParams = {
    operation: FlowOperationRequest
    previousStatus: FlowStatus
    newStatus: FlowStatus
}
