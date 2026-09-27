import { Permission } from '@fema-ipaas/core-utils'
import {
    ApplicationEventName,
    CreateMcpServiceRequestBody,
    ListMcpServicesRequestQuery,
    McpConnectorToolParamsQuery,
    McpService,
    McpServiceApiKey,
    McpServiceIssues,
    McpServiceMembership,
    McpToolDebugRequestBody,
    McpToolDebugResult,
    McpToolParam,
    McpWorkflowToolCandidate,
    PrincipalType,
    PublishMcpServiceRequestBody,
    SetMcpServiceListedRequestBody,
    SetMcpServiceStatusRequestBody,
    TransferMcpServiceRequestBody,
    UpdateMcpServiceAvailabilityRequestBody,
    UpdateMcpServiceConnectionsRequestBody,
    UpdateMcpServiceInfoRequestBody,
    UpdateMcpServiceMyConnectionsRequestBody,
    UpdateMcpServiceToolsRequestBody,
} from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { mcpServiceDebugService } from './mcp-service-debug.service'
import { mcpServiceService } from './mcp-service.service'

export const mcpServiceController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<McpService[]> => {
        return mcpServiceService(request.log).list({ tenantId: request.principal.tenant.id, userId: request.principal.id, query: request.query })
    })

    app.get('/candidates', CandidatesRequest, async (request): Promise<McpWorkflowToolCandidate[]> => {
        return mcpServiceService(request.log).candidates({ projectId: request.projectId })
    })

    app.get('/connector-tool-params', ConnectorToolParamsRequest, async (request): Promise<McpToolParam[]> => {
        return mcpServiceService(request.log).connectorToolParams({
            tenantId: request.principal.tenant.id,
            connectorName: request.query.connectorName,
            actionName: request.query.actionName,
        })
    })

    app.post('/', CreateRequest, async (request, reply) => {
        const service = await mcpServiceService(request.log).create({ tenantId: request.principal.tenant.id, userId: request.principal.id, request: request.body })
        audit({ request, service: { id: service.id, name: service.name }, change: 'CREATED', detail: service.key ?? null })
        await reply.status(StatusCodes.CREATED).send(service)
    })

    app.get('/:id', GetRequest, async (request): Promise<McpService> => {
        return mcpServiceService(request.log).get(refOf(request))
    })

    app.get('/:id/issues', IssuesRequest, async (request): Promise<McpServiceIssues> => {
        return mcpServiceService(request.log).issues(refOf(request))
    })

    app.post('/:id/info', UpdateInfoRequest, async (request): Promise<McpService> => {
        const service = await mcpServiceService(request.log).updateInfo({ ...refOf(request), request: request.body })
        audit({ request, service, change: 'UPDATED', detail: null })
        return service
    })

    app.post('/:id/tools', UpdateToolsRequest, async (request): Promise<McpService> => {
        const service = await mcpServiceService(request.log).updateTools({ ...refOf(request), request: request.body })
        audit({ request, service, change: 'TOOLS_UPDATED', detail: service.tools.map((tool) => tool.name).join(', ') })
        return service
    })

    app.post('/:id/connections', UpdateConnectionsRequest, async (request): Promise<McpService> => {
        const service = await mcpServiceService(request.log).updateConnections({ ...refOf(request), request: request.body })
        audit({ request, service, change: 'CONNECTIONS_UPDATED', detail: request.body.credentialMode })
        return service
    })

    app.post('/:id/availability', UpdateAvailabilityRequest, async (request): Promise<McpService> => {
        const service = await mcpServiceService(request.log).updateAvailability({ ...refOf(request), request: request.body })
        audit({ request, service, change: 'AVAILABILITY_UPDATED', detail: request.body.availability.mode })
        return service
    })

    app.post('/:id/publish', PublishRequest, async (request): Promise<McpService> => {
        const service = await mcpServiceService(request.log).publish({ ...refOf(request), request: request.body })
        audit({ request, service, change: 'PUBLISHED', detail: service.publishedVersion ?? null })
        return service
    })

    app.post('/:id/status', StatusRequest, async (request): Promise<McpService> => {
        const service = await mcpServiceService(request.log).setStatus({ ...refOf(request), status: request.body.status })
        audit({ request, service, change: request.body.status === 'ENABLED' ? 'ENABLED' : 'PAUSED', detail: null })
        return service
    })

    app.post('/:id/listed', ListedRequest, async (request): Promise<McpService> => {
        const service = await mcpServiceService(request.log).setListed({ ...refOf(request), listed: request.body.listed })
        audit({ request, service, change: request.body.listed ? 'LISTED' : 'UNLISTED', detail: null })
        return service
    })

    app.post('/:id/transfer', TransferRequest, async (request): Promise<McpService> => {
        const service = await mcpServiceService(request.log).transfer({ ...refOf(request), ownerId: request.body.ownerId })
        audit({ request, service, change: 'TRANSFERRED', detail: request.body.ownerId })
        return service
    })

    app.delete('/:id', DeleteRequest, async (request, reply) => {
        const service = await mcpServiceService(request.log).delete(refOf(request))
        audit({ request, service: { id: service.id, name: service.name }, change: 'DELETED', detail: null })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.post('/:id/obtain', ObtainRequest, async (request): Promise<McpServiceMembership> => {
        const membership = await mcpServiceService(request.log).obtain(refOf(request))
        const service = await mcpServiceService(request.log).get(refOf(request))
        audit({ request, service, change: 'OBTAINED', detail: null })
        return membership
    })

    app.delete('/:id/obtain', LeaveRequest, async (request, reply) => {
        await mcpServiceService(request.log).leave(refOf(request))
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.get('/:id/membership', MembershipRequest, async (request): Promise<McpServiceMembership | null> => {
        return mcpServiceService(request.log).membership(refOf(request))
    })

    app.get('/:id/my-key', MyKeyRequest, async (request): Promise<McpServiceApiKey> => {
        return mcpServiceService(request.log).myKey(refOf(request))
    })

    app.post('/:id/my-key/reset', ResetKeyRequest, async (request): Promise<McpServiceApiKey> => {
        const key = await mcpServiceService(request.log).resetMyKey(refOf(request))
        const service = await mcpServiceService(request.log).get(refOf(request))
        audit({ request, service, change: 'KEY_RESET', detail: null })
        return key
    })

    app.post('/:id/my-connections', MyConnectionsRequest, async (request): Promise<McpServiceMembership> => {
        return mcpServiceService(request.log).updateMyConnections({ ...refOf(request), connections: request.body.connections })
    })

    app.post('/:id/debug', DebugRequest, async (request): Promise<McpToolDebugResult> => {
        const result = await mcpServiceDebugService(request.log).debug({ ...refOf(request), request: request.body })
        audit({ request, service: result.service, change: 'TOOL_DEBUGGED', detail: result.toolName })
        return result.result
    })
}

function refOf(request: { principal: { id: string, tenant: { id: string } }, params: { id: string } }): { tenantId: string, userId: string, id: string } {
    return { tenantId: request.principal.tenant.id, userId: request.principal.id, id: request.params.id }
}

function audit({ request, service, change, detail }: AuditParams): void {
    applicationEvents(request.log).sendUserEvent(request, {
        action: ApplicationEventName.MCP_SERVICE_CHANGED,
        data: { service: { id: service.id, name: service.name }, change, detail },
    })
}

const IdParams = z.object({ id: z.string() })
const userOnly = securityAccess.publicTenant([PrincipalType.USER])
const tags = ['mcp-services']

const ListRequest = {
    config: { security: userOnly },
    schema: { tags, querystring: ListMcpServicesRequestQuery, response: { [StatusCodes.OK]: z.array(McpService) } },
}

const CandidatesRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_MCP_SERVICE, { type: ProjectResourceType.QUERY }) },
    schema: { tags, querystring: z.object({ projectId: z.string() }), response: { [StatusCodes.OK]: z.array(McpWorkflowToolCandidate) } },
}

const ConnectorToolParamsRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_MCP_SERVICE, { type: ProjectResourceType.QUERY }) },
    schema: { tags, querystring: McpConnectorToolParamsQuery, response: { [StatusCodes.OK]: z.array(McpToolParam) } },
}

const CreateRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_MCP_SERVICE, { type: ProjectResourceType.BODY }) },
    schema: { tags, body: CreateMcpServiceRequestBody, response: { [StatusCodes.CREATED]: McpService } },
}

const GetRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, response: { [StatusCodes.OK]: McpService } },
}

const IssuesRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, response: { [StatusCodes.OK]: McpServiceIssues } },
}

const UpdateInfoRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: UpdateMcpServiceInfoRequestBody, response: { [StatusCodes.OK]: McpService } },
}

const UpdateToolsRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: UpdateMcpServiceToolsRequestBody, response: { [StatusCodes.OK]: McpService } },
}

const UpdateConnectionsRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: UpdateMcpServiceConnectionsRequestBody, response: { [StatusCodes.OK]: McpService } },
}

const UpdateAvailabilityRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: UpdateMcpServiceAvailabilityRequestBody, response: { [StatusCodes.OK]: McpService } },
}

const PublishRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: PublishMcpServiceRequestBody, response: { [StatusCodes.OK]: McpService } },
}

const StatusRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: SetMcpServiceStatusRequestBody, response: { [StatusCodes.OK]: McpService } },
}

const ListedRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: SetMcpServiceListedRequestBody, response: { [StatusCodes.OK]: McpService } },
}

const TransferRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: TransferMcpServiceRequestBody, response: { [StatusCodes.OK]: McpService } },
}

const DeleteRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams },
}

const ObtainRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, response: { [StatusCodes.OK]: McpServiceMembership } },
}

const LeaveRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams },
}

const MembershipRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, response: { [StatusCodes.OK]: McpServiceMembership.nullable() } },
}

const MyKeyRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, response: { [StatusCodes.OK]: McpServiceApiKey } },
}

const ResetKeyRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, response: { [StatusCodes.OK]: McpServiceApiKey } },
}

const MyConnectionsRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: UpdateMcpServiceMyConnectionsRequestBody, response: { [StatusCodes.OK]: McpServiceMembership } },
}

const DebugRequest = {
    config: { security: userOnly },
    schema: { tags, params: IdParams, body: McpToolDebugRequestBody, response: { [StatusCodes.OK]: McpToolDebugResult } },
}

type AuditParams = {
    request: FastifyRequest
    service: { id: string, name: string }
    change: 'CREATED' | 'UPDATED' | 'TOOLS_UPDATED' | 'CONNECTIONS_UPDATED' | 'AVAILABILITY_UPDATED' | 'PUBLISHED' | 'PAUSED' | 'ENABLED' | 'LISTED' | 'UNLISTED' | 'KEY_RESET' | 'TRANSFERRED' | 'DELETED' | 'OBTAINED' | 'TOOL_DEBUGGED'
    detail: string | null
}
