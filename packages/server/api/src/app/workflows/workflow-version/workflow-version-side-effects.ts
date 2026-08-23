import { isNil, WorkspaceId } from '@fema-ipaas/core-utils'
import { FileType, WorkflowOperationRequest, WorkflowOperationType, workflowStructureUtil, WorkflowVersion } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { EntityManager } from 'typeorm'
import { exceptionHandler } from '../../helper/exception-handler'
import { triggerSourceService } from '../../trigger/trigger-source/trigger-source-service'
import { sampleDataService } from '../step-run/sample-data.service'
import { workflowService } from '../workflow/workflow.service'

type OnApplyOperationParams = {
    workspaceId: WorkspaceId
    workflowVersion: WorkflowVersion
    operation: WorkflowOperationRequest
    entityManager?: EntityManager
}


export const workflowVersionSideEffects = (log: FastifyBaseLogger) => ({
    async preApplyOperation({
        workspaceId,
        workflowVersion,
        operation,
        entityManager,
    }: OnApplyOperationParams): Promise<void> {
        try {
            await handleSampleDataDeletion(workspaceId, workflowVersion, operation, log)
            await handleUpdateTriggerWebhookSimulation(workspaceId, workflowVersion, operation, log)
        }
        catch (e) {
            // Ignore error and continue the operation peacefully
            exceptionHandler.handle(e, log)
        }
        await workflowService(log).updateLastModified({
            workflowId: workflowVersion.workflowId,
            workspaceId,
            entityManager,
        })
    },
})




async function handleSampleDataDeletion(workspaceId: WorkspaceId, workflowVersion: WorkflowVersion, operation: WorkflowOperationRequest, log: FastifyBaseLogger): Promise<void> {
    if (operation.type !== WorkflowOperationType.UPDATE_TRIGGER && operation.type !== WorkflowOperationType.DELETE_ACTION) {
        return
    }
    switch (operation.type) {
        case WorkflowOperationType.UPDATE_TRIGGER:
        {
            const stepToDelete = workflowStructureUtil.getStepOrThrow(operation.request.name, workflowVersion.trigger)
            const triggerChanged = operation.type === WorkflowOperationType.UPDATE_TRIGGER && (workflowVersion.trigger.type !== operation.request.type
                    || workflowVersion.trigger.settings.triggerName !== operation.request.settings.triggerName
                    || workflowVersion.trigger.settings.connectorName !== operation.request.settings.connectorName)
            const sampleDataExists = !isNil(stepToDelete?.settings.sampleData?.sampleDataFileId)
            if (triggerChanged && sampleDataExists) {
                await sampleDataService(log).deleteForStep({
                    workspaceId,
                    workflowVersionId: workflowVersion.id,
                    workflowId: workflowVersion.workflowId,
                    fileId: stepToDelete.settings.sampleData.sampleDataFileId,
                    fileType: FileType.SAMPLE_DATA,
                })
            }
            const sampleDataInputExists = !isNil(stepToDelete?.settings.sampleData?.sampleDataInputFileId)
            if (triggerChanged && sampleDataInputExists) {
                await sampleDataService(log).deleteForStep({
                    workspaceId,
                    workflowVersionId: workflowVersion.id,
                    workflowId: workflowVersion.workflowId,
                    fileId: stepToDelete.settings.sampleData.sampleDataInputFileId,
                    fileType: FileType.SAMPLE_DATA_INPUT,
                })
            }
            break
        }
        case WorkflowOperationType.DELETE_ACTION: {
            const stepsToDelete = operation.request.names.map(name => workflowStructureUtil.getStepOrThrow(name, workflowVersion.trigger))
            for (const step of stepsToDelete) {
                const sampleDataExists = !isNil(step.settings.sampleData?.sampleDataFileId)
                if (sampleDataExists) {
                    await sampleDataService(log).deleteForStep({
                        workspaceId,
                        workflowVersionId: workflowVersion.id,
                        workflowId: workflowVersion.workflowId,
                        fileId: step.settings.sampleData.sampleDataFileId,
                        fileType: FileType.SAMPLE_DATA,
                    })
                }
                const sampleDataInputExists = !isNil(step.settings.sampleData?.sampleDataInputFileId)
                if (sampleDataInputExists) {
                    await sampleDataService(log).deleteForStep({
                        workspaceId,
                        workflowVersionId: workflowVersion.id,
                        workflowId: workflowVersion.workflowId,
                        fileId: step.settings.sampleData.sampleDataInputFileId,
                        fileType: FileType.SAMPLE_DATA_INPUT,
                    })
                }
            }
            break
        }
        default:
            return
    }

}

async function handleUpdateTriggerWebhookSimulation(workspaceId: WorkspaceId, workflowVersion: WorkflowVersion, operation: WorkflowOperationRequest, log: FastifyBaseLogger): Promise<void> {
    if (operation.type === WorkflowOperationType.UPDATE_TRIGGER) {
        await triggerSourceService(log).disable({
            workflowId: workflowVersion.workflowId,
            workspaceId,
            simulate: true,
            ignoreError: true,
        })
    }
}
