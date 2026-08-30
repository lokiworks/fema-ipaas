import { generateId, ProjectId, WorkflowId } from '@fema-ipaas/core-utils'
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
        projectId,
    }: CreateParams): Promise<void> {
        const upsertCommands: Promise<unknown>[] = []
        events.forEach((event) => {
            const upsert = appEventRoutingRepo().upsert(
                {
                    id: generateId(),
                    appName,
                    event,
                    identifierValue,
                    workflowId,
                    projectId,
                },
                ['appName', 'event', 'identifierValue', 'projectId', 'workflowId'],
            )
            upsertCommands.push(upsert)
        })
        await Promise.all(upsertCommands)
    },
    async deleteListeners({
        projectId,
        workflowId,
    }: DeleteParams): Promise<void> {
        await appEventRoutingRepo().delete({
            projectId,
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
    projectId: ProjectId
    workflowId: WorkflowId
}

type CreateParams = {
    appName: string
    events: string[]
    identifierValue: string
    workflowId: WorkflowId
    projectId: ProjectId
}