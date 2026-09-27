import { SeekPage } from '@fema-ipaas/core-utils'
import {
    ApplicationEventName,
    ConnectorDemand,
    ConnectorUsageResponse,
    ConnectorWorkflowUsage,
    CreateConnectorDemandRequestBody,
    ListConnectorDemandsRequestQuery,
    ListConnectorWorkflowsRequestQuery,
    PrincipalType,
    UpdateConnectorDemandRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../helper/application-events'
import { connectorDemandService } from '../demand/connector-demand.service'
import { connectorUsageService } from './connector-usage.service'

export const connectorDemandController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreateDemandRequest, async (request, reply) => {
        const demand = await connectorDemandService(request.log).create({
            tenantId: request.principal.tenant.id,
            requesterId: request.principal.id,
            request: request.body,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTOR_DEMAND_SUBMITTED,
            data: { demand: { id: demand.id, appName: demand.appName } },
        })
        await reply.status(StatusCodes.CREATED).send(demand)
    })

    app.get('/', ListDemandsRequest, async (request): Promise<SeekPage<ConnectorDemand>> => {
        return connectorDemandService(request.log).list({ tenantId: request.principal.tenant.id, query: request.query })
    })

    app.post('/:id', UpdateDemandRequest, async (request): Promise<ConnectorDemand> => {
        return connectorDemandService(request.log).updateStatus({
            tenantId: request.principal.tenant.id,
            id: request.params.id,
            status: request.body.status,
        })
    })
}

export const connectorUsageController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', UsageRequest, async (request): Promise<ConnectorUsageResponse> => {
        const data = await connectorUsageService(request.log).summary({ tenantId: request.principal.tenant.id, userId: request.principal.id })
        return { data }
    })

    app.get('/workflows', UsageWorkflowsRequest, async (request): Promise<ConnectorWorkflowUsage[]> => {
        return connectorUsageService(request.log).workflows({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            connectorName: request.query.connectorName,
        })
    })
}

const userOnly = securityAccess.publicTenant([PrincipalType.USER])
const adminOnly = securityAccess.tenantAdminOnly([PrincipalType.USER])

const CreateDemandRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connector-demands'],
        description: 'Ask the tenant admins for a connector that does not exist yet.',
        body: CreateConnectorDemandRequestBody,
        response: { [StatusCodes.CREATED]: ConnectorDemand },
    },
}

const ListDemandsRequest = {
    config: { security: adminOnly },
    schema: {
        tags: ['connector-demands'],
        description: 'List the connector requests of the tenant.',
        querystring: ListConnectorDemandsRequestQuery,
        response: { [StatusCodes.OK]: SeekPage(ConnectorDemand) },
    },
}

const UpdateDemandRequest = {
    config: { security: adminOnly },
    schema: {
        tags: ['connector-demands'],
        description: 'Record what happened to a connector request.',
        params: z.object({ id: z.string() }),
        body: UpdateConnectorDemandRequestBody,
        response: { [StatusCodes.OK]: ConnectorDemand },
    },
}

const UsageRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connector-usage'],
        description: 'Count the workflows using each connector, in the tenant and in the projects of the current user.',
        response: { [StatusCodes.OK]: ConnectorUsageResponse },
    },
}

const UsageWorkflowsRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connector-usage'],
        description: 'List the workflows in the projects of the current user that use a connector.',
        querystring: ListConnectorWorkflowsRequestQuery,
        response: { [StatusCodes.OK]: z.array(ConnectorWorkflowUsage) },
    },
}
