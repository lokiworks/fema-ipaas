import { apId, FlowId, WorkspaceId } from '@fema/core-utils'
import { repoFactory } from '../../core/db/repo-factory'
import {
    AppEventRouting,
    AppEventRoutingEntity,
} from './app-event-routing.entity'

const appEventRoutingRepo = repoFactory(AppEventRoutingEntity)

export const appEventRoutingService = {
    async listListeners({
        appName,
        event,
        identifierValue,
    }: ListParams): Promise<AppEventRouting[]> {
        return appEventRoutingRepo().findBy({ appName, event, identifierValue })
    },
    async createListeners({
        appName,
        events,
        identifierValue,
        flowId,
        workspaceId,
    }: CreateParams): Promise<void> {
        const upsertCommands: Promise<unknown>[] = []
        events.forEach((event) => {
            const upsert = appEventRoutingRepo().upsert(
                {
                    id: apId(),
                    appName,
                    event,
                    identifierValue,
                    flowId,
                    workspaceId,
                },
                ['appName', 'event', 'identifierValue', 'workspaceId', 'flowId'],
            )
            upsertCommands.push(upsert)
        })
        await Promise.all(upsertCommands)
    },
    async deleteListeners({
        workspaceId,
        flowId,
    }: DeleteParams): Promise<void> {
        await appEventRoutingRepo().delete({
            workspaceId,
            flowId,
        })
    },
}

type ListParams = {
    appName: string
    event: string
    identifierValue: string
}
type DeleteParams = {
    workspaceId: WorkspaceId
    flowId: FlowId
}

type CreateParams = {
    appName: string
    events: string[]
    identifierValue: string
    flowId: FlowId
    workspaceId: WorkspaceId
}