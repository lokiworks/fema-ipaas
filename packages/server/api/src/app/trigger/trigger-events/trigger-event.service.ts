import { apId, Cursor, ErrorCode, FlowId, PlatformError, SeekPage, WorkspaceId } from '@fema/core-utils'
import { ConnectorTrigger, EngineResponse, EngineResponseStatus, ExecuteTriggerResponse, FileCompression, FileType, FlowTrigger, FlowTriggerType, getConnectorMajorAndMinorVersion, PopulatedFlow, TriggerEventWithPayload, TriggerHookType, WorkerJobType } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { fileService } from '../../file/file.service'
import { flowService } from '../../flows/flow/flow.service'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { Order } from '../../helper/pagination/paginator'
import { userInteractionWatcher } from '../../workers/user-interaction-watcher'
import { workspaceService } from '../../workspace/workspace-service'
import { TriggerEventEntity } from './trigger-event.entity'

export const triggerEventRepo = repoFactory(TriggerEventEntity)

export const triggerEventService = (log: FastifyBaseLogger) => ({
    async saveEvent({
        workspaceId,
        flowId,
        payload,
    }: SaveEventParams): Promise<TriggerEventWithPayload> {
        const flow = await flowService(log).getOnePopulatedOrThrow({
            id: flowId,
            workspaceId,
        })

        const data = Buffer.from(JSON.stringify(payload))
        const file = await fileService(log).save({
            workspaceId,
            fileName: `${apId()}.json`,
            data,
            size: data.length,
            type: FileType.TRIGGER_EVENT_FILE,
            compression: FileCompression.NONE,
        })
        const sourceName = getSourceName(flow.version.trigger)

        const trigger = await triggerEventRepo().save({
            id: apId(),
            fileId: file.id,
            workspaceId,
            flowId: flow.id,
            sourceName,
        })
        return {
            ...trigger,
            payload,
        }
    },

    async test({
        workspaceId,
        flow,
    }: TestParams): Promise<SeekPage<TriggerEventWithPayload>> {
        const trigger = flow.version.trigger
        const platformId = await workspaceService(log).getPlatformId(workspaceId)
        const emptyPage = paginationHelper.createPage<TriggerEventWithPayload>([], null)
        switch (trigger.type) {
            case FlowTriggerType.CONNECTOR: {

                const engineResponse = await userInteractionWatcher.submitAndWaitForResponse<EngineResponse<ExecuteTriggerResponse<TriggerHookType.TEST>>>({
                    hookType: TriggerHookType.TEST,
                    flowId: flow.id,
                    flowVersionId: flow.version.id,
                    test: true,
                    workspaceId,
                    jobType: WorkerJobType.EXECUTE_TRIGGER_HOOK,
                    platformId,
                }, log)
                await triggerEventRepo().delete({
                    workspaceId,
                    flowId: flow.id,
                })
                if (engineResponse.status !== EngineResponseStatus.OK) {
                    throw new PlatformError({
                        code: ErrorCode.TEST_TRIGGER_FAILED,
                        params: {
                            message: engineResponse.error ?? 'Unknown trigger error',
                        },
                    })
                }

                for (const output of engineResponse.response.output) {
                    await this.saveEvent({
                        workspaceId,
                        flowId: flow.id,
                        payload: output,
                    })
                }

                return this.list({
                    workspaceId,
                    flow,
                    cursor: null,
                    limit: engineResponse.response.output.length,
                })
            }
            case FlowTriggerType.EMPTY:
                return emptyPage
        }
    },

    async list({
        workspaceId,
        flow,
        cursor,
        limit,
    }: ListParams): Promise<SeekPage<TriggerEventWithPayload>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor)
        const sourceName = getSourceName(flow.version.trigger)
        const flowId = flow.id
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
            workspaceId,
            flowId,
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

function getSourceName(trigger: FlowTrigger): string {
    switch (trigger.type) {
        case FlowTriggerType.CONNECTOR: {
            const connectorTrigger = trigger as ConnectorTrigger
            const connectorName = connectorTrigger.settings.connectorName
            const connectorVersion = getConnectorMajorAndMinorVersion(
                connectorTrigger.settings.connectorVersion,
            )
            const triggerName = connectorTrigger.settings.triggerName
            return `${connectorName}@${connectorVersion}:${triggerName}`
        }

        case FlowTriggerType.EMPTY:
            return trigger.type
    }
}

type TestParams = {
    workspaceId: WorkspaceId
    flow: PopulatedFlow
}

type SaveEventParams = {
    workspaceId: WorkspaceId
    flowId: FlowId
    payload: unknown
}

type ListParams = {
    workspaceId: WorkspaceId
    flow: PopulatedFlow
    cursor: Cursor | null
    limit: number
}
