import { ApplicationError, Cursor, ErrorCode, generateId, ProjectId, SeekPage, WorkflowId } from '@fema-ipaas/core-utils'
import { ConnectorTrigger, EngineResponse, EngineResponseStatus, ExecuteTriggerResponse, FileCompression, FileType, getConnectorMajorAndMinorVersion, PopulatedWorkflow, TriggerEventWithPayload, TriggerHookType, WorkerJobType, WorkflowTrigger, WorkflowTriggerType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { fileService } from '../../file/file.service'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { Order } from '../../helper/pagination/paginator'
import { projectService } from '../../project/project-service'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { workflowService } from '../../workflows/workflow/workflow.service'
import { TriggerEventEntity } from './trigger-event.entity'

export const triggerEventRepo = repoFactory(TriggerEventEntity)

export const triggerEventService = (log: FastifyBaseLogger) => ({
    async saveEvent({
        projectId,
        workflowId,
        payload,
    }: SaveEventParams): Promise<TriggerEventWithPayload> {
        const workflow = await workflowService(log).getOnePopulatedOrThrow({
            id: workflowId,
            projectId,
        })

        const data = Buffer.from(JSON.stringify(payload))
        const file = await fileService(log).save({
            projectId,
            fileName: `${generateId()}.json`,
            data,
            size: data.length,
            type: FileType.TRIGGER_EVENT_FILE,
            compression: FileCompression.NONE,
        })
        const sourceName = getSourceName(workflow.version.trigger)

        const trigger = await triggerEventRepo().save({
            id: generateId(),
            fileId: file.id,
            projectId,
            workflowId: workflow.id,
            sourceName,
        })
        return {
            ...trigger,
            payload,
        }
    },

    async test({
        projectId,
        workflow,
    }: TestParams): Promise<SeekPage<TriggerEventWithPayload>> {
        const trigger = workflow.version.trigger
        const tenantId = await projectService(log).getTenantId(projectId)
        const emptyPage = paginationHelper.createPage<TriggerEventWithPayload>([], null)
        switch (trigger.type) {
            case WorkflowTriggerType.CONNECTOR: {

                const engineResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteTriggerResponse<TriggerHookType.TEST>>>({
                    hookType: TriggerHookType.TEST,
                    workflowId: workflow.id,
                    workflowVersionId: workflow.version.id,
                    test: true,
                    projectId,
                    jobType: WorkerJobType.EXECUTE_TRIGGER_HOOK,
                    tenantId,
                }, log)
                await triggerEventRepo().delete({
                    projectId,
                    workflowId: workflow.id,
                })
                if (engineResponse.status !== EngineResponseStatus.OK) {
                    throw new ApplicationError({
                        code: ErrorCode.TEST_TRIGGER_FAILED,
                        params: {
                            message: engineResponse.error ?? 'Unknown trigger error',
                        },
                    })
                }

                for (const output of engineResponse.response.output) {
                    await this.saveEvent({
                        projectId,
                        workflowId: workflow.id,
                        payload: output,
                    })
                }

                return this.list({
                    projectId,
                    workflow,
                    cursor: null,
                    limit: engineResponse.response.output.length,
                })
            }
            case WorkflowTriggerType.EMPTY:
                return emptyPage
        }
    },

    async list({
        projectId,
        workflow,
        cursor,
        limit,
    }: ListParams): Promise<SeekPage<TriggerEventWithPayload>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor)
        const sourceName = getSourceName(workflow.version.trigger)
        const workflowId = workflow.id
        const paginator = buildPaginator({
            entity: TriggerEventEntity,
            query: {
                limit,
                order: Order.DESC,
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const query = triggerEventRepo().createQueryBuilder('trigger_event').where({
            projectId,
            workflowId,
            sourceName,
        })
        const { data, cursor: newCursor } = await paginator.paginate(query)
        const dataWithPayload = await Promise.all(data.map(async (triggerEvent) => {
            const fileData = await fileService(log).getDataOrThrow({
                fileId: triggerEvent.fileId,
            })
            const decodedPayload = JSON.parse(fileData.data.toString())
            return {
                ...triggerEvent,
                payload: decodedPayload,
            }
        }))
        return paginationHelper.createPage<TriggerEventWithPayload>(dataWithPayload, newCursor)
    },
})

function getSourceName(trigger: WorkflowTrigger): string {
    switch (trigger.type) {
        case WorkflowTriggerType.CONNECTOR: {
            const connectorTrigger = trigger as ConnectorTrigger
            const connectorName = connectorTrigger.settings.connectorName
            const connectorVersion = getConnectorMajorAndMinorVersion(
                connectorTrigger.settings.connectorVersion,
            )
            const triggerName = connectorTrigger.settings.triggerName
            return `${connectorName}@${connectorVersion}:${triggerName}`
        }

        case WorkflowTriggerType.EMPTY:
            return trigger.type
    }
}

type TestParams = {
    projectId: ProjectId
    workflow: PopulatedWorkflow
}

type SaveEventParams = {
    projectId: ProjectId
    workflowId: WorkflowId
    payload: unknown
}

type ListParams = {
    projectId: ProjectId
    workflow: PopulatedWorkflow
    cursor: Cursor | null
    limit: number
}
