import { WorkflowId, WorkspaceId } from '@fema-ipaas/core-utils'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../../database/database-common'

export type AppEventRoutingId = string

export type AppEventRouting = {
    id: AppEventRoutingId
    created: string
    updated: string
    appName: string
    workspaceId: WorkspaceId
    workflowId: WorkflowId
    identifierValue: string
    event: string
}

export const AppEventRoutingEntity = new EntitySchema<AppEventRouting>({
    name: 'app_event_routing',
    columns: {
        ...BaseColumnSchemaPart,
        appName: {
            type: String,
        },
        workspaceId: EntityIdSchema,
        workflowId: EntityIdSchema,
        identifierValue: {
            type: String,
        },
        event: {
            type: String,
        },
    },
    indices: [
        {
            name: 'idx_app_event_routing_workflow_id',
            columns: ['workflowId'],
            unique: false,
        },
        {
            name: 'idx_app_event_wf_ws_app_identifier_value_event',
            columns: ['appName', 'workspaceId', 'workflowId', 'identifierValue', 'event'],
            unique: true,
        },
        {
            name: 'idx_app_event_appName_identifier_event',
            columns: ['appName', 'identifierValue', 'event'],
            unique: false,
        },
    ],
})
