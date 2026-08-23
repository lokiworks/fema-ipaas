import { apId, WorkflowId, WorkspaceId } from '@fema/core-utils'
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
        workflowId,
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
                    workflowId,
                    workspaceId,
                },
                ['appName', 'event', 'identifierValue', 'workspaceId', 'workflowId'],
            )
            upsertCommands.push(upsert)
        })
        await Promise.all(upsertCommands)
    },
    async deleteListeners({
        workspaceId,
        workflowId,
    }: DeleteParams): Promise<void> {
        await appEventRoutingRepo().delete({
            workspaceId,
            workflowId,
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
    workflowId: WorkflowId
}

type CreateParams = {
    appName: string
    events: string[]
    identifierValue: string
    workflowId: WorkflowId
    workspaceId: WorkspaceId
}