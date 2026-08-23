import { SeekPage } from '@fema-ipaas/core-utils'
import { ApplicationEventName, CreateNetworkAgentRequest, ListNetworkAgentsRequest, NetworkAgent, NetworkAgentIdParams, NetworkAgentWithToken, PrincipalType, ProxyThroughAgentRequest, UpdateNetworkAgentRequest } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { networkAgentTunnel } from './network-agent-tunnel'
import { networkAgentService } from './network-agent.service'

export const networkAgentController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<SeekPage<NetworkAgent>> => {
        return networkAgentService(request.log).list({
            tenantId: request.principal.tenant.id,
            workspaceId: request.query.workspaceId,
            cursor: request.query.cursor ?? null,
            limit: request.query.limit ?? DEFAULT_LIMIT,
        })
    })

    app.post('/', CreateRequest, async (request): Promise<NetworkAgentWithToken> => {
        const agent = await networkAgentService(request.log).create({
            tenantId: request.principal.tenant.id,
            workspaceId: request.body.workspaceId,
            displayName: request.body.displayName,
            hostAllowlist: request.body.hostAllowlist,
            cidrAllowlist: request.body.cidrAllowlist,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.NETWORK_AGENT_CREATED,
            data: { networkAgent: { id: agent.id, displayName: agent.displayName } },
        })
        return agent
    })

    app.get('/:id', GetRequest, async (request): Promise<NetworkAgent> => {
        return networkAgentService(request.log).getOneOrThrow({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
        })
    })

    app.post('/:id', UpdateRequest, async (request): Promise<NetworkAgent> => {
        return networkAgentService(request.log).update({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
            ...request.body,
        })
    })

    app.post('/proxy', ProxyRequestConfig, async (request) => {
        return networkAgentTunnel.proxy({
            log: request.log,
            tenantId: request.principal.tenant.id,
            networkAgentId: request.body.networkAgentId,
            method: request.body.method,
            url: request.body.url,
            headers: request.body.headers,
            body: request.body.body,
        })
    })

    app.delete('/:id', GetRequest, async (request, reply) => {
        await networkAgentService(request.log).delete({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const DEFAULT_LIMIT = 50

const adminOnly = securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE])

const ListRequest = {
    config: { security: adminOnly },
    schema: { querystring: ListNetworkAgentsRequest },
}

const CreateRequest = {
    config: { security: adminOnly },
    schema: { body: CreateNetworkAgentRequest },
}

const GetRequest = {
    config: { security: adminOnly },
    schema: { params: NetworkAgentIdParams },
}

const ProxyRequestConfig = {
    config: {
        security: securityAccess.unscoped([PrincipalType.ENGINE, PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: { body: ProxyThroughAgentRequest },
}

const UpdateRequest = {
    config: { security: adminOnly },
    schema: { params: NetworkAgentIdParams, body: UpdateNetworkAgentRequest },
}
