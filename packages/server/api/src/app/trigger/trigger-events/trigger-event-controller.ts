
import {
    ListTriggerEventsRequest,
    PrincipalType,
    SaveTriggerEventRequest,
} from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { flowService } from '../../flows/flow/flow.service'
import { triggerEventService } from './trigger-event.service'

const DEFAULT_PAGE_SIZE = 10

export const triggerEventController: FastifyPluginAsyncZod = async (fastify) => {


    fastify.post('/', SaveTriggerEventRequestParams, async (request) => {
        return triggerEventService(request.log).saveEvent({
            workspaceId: request.workspaceId,
            flowId: request.body.flowId,
            payload: request.body.mockData,
        })
    })

    fastify.get('/', ListTriggerEventsRequestParams, async (request) => {
        const flow = await flowService(request.log).getOnePopulatedOrThrow({
            id: request.query.flowId,
            workspaceId: request.workspaceId,
        })

        return triggerEventService(request.log).list({
            workspaceId: request.workspaceId,
            flow,
            cursor: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
        })
    },
    )
}


const ListTriggerEventsRequestParams = {
    schema: {
        querystring: ListTriggerEventsRequest,
    },
    config: {
        security: securityAccess.workspace([PrincipalType.USER], undefined, {
            type: WorkspaceResourceType.QUERY,
        }),
    },
}

const SaveTriggerEventRequestParams = {
    schema: {
        body: SaveTriggerEventRequest,
    },
    config: {
        security: securityAccess.workspace([PrincipalType.USER], undefined, {
            type: WorkspaceResourceType.BODY,
        }),
    },
}