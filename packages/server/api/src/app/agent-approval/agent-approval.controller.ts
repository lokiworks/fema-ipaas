import { ApplicationError, EntityId, ErrorCode, Permission } from '@fema-ipaas/core-utils'
import {
    AgentApproval,
    AgentApprovalWithWorkflow,
    ApplicationEventName,
    CreateAgentApprovalRequestBody,
    CreateAgentApprovalResponse,
    DecideAgentApprovalRequestBody,
    ListAgentApprovalsRequestQuery,
    PrincipalType,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { AgentApprovalEntity } from './agent-approval.entity'
import { agentApprovalService } from './agent-approval.service'

export const agentApprovalController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<AgentApprovalWithWorkflow[]> => {
        return agentApprovalService(request.log).list({ query: request.query, userId: request.principal.id })
    })

    app.get('/pending-count', PendingCountRequest, async (request) => {
        const count = await agentApprovalService(request.log).countPendingForUser({ projectId: request.projectId, userId: request.principal.id })
        return { count }
    })

    app.post('/:id/decide', DecideRequest, async (request): Promise<AgentApproval> => {
        const decided = await agentApprovalService(request.log).decide({
            id: request.params.id,
            projectId: request.projectId,
            userId: request.principal.id,
            request: request.body,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.AGENT_APPROVAL_DECIDED,
            data: {
                approval: { id: decided.id, tool: decided.tool, executionId: decided.executionId },
                approved: request.body.approved,
                comment: request.body.comment ?? null,
            },
        })
        return decided
    })
}

export const agentApprovalWorkerController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', WorkerCreateRequest, async (request, reply) => {
        const principal = request.principal
        if (principal.type !== PrincipalType.ENGINE || !principal.projectId) {
            throw new ApplicationError({ code: ErrorCode.AUTHORIZATION, params: { message: 'Only a running engine can request approval' } })
        }
        const created = await agentApprovalService(request.log).create({ projectId: principal.projectId, request: request.body })
        await reply.status(StatusCodes.CREATED).send(created)
    })
}

const ListRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_RUN, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['agent-approvals'], querystring: ListAgentApprovalsRequestQuery, response: { [StatusCodes.OK]: z.array(AgentApprovalWithWorkflow) } },
}

const PendingCountRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_RUN, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['agent-approvals'], querystring: z.object({ projectId: z.string() }) },
}

const DecideRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_RUN, { type: ProjectResourceType.TABLE, tableName: AgentApprovalEntity }) },
    schema: { tags: ['agent-approvals'], params: z.object({ id: EntityId }), body: DecideAgentApprovalRequestBody, response: { [StatusCodes.OK]: AgentApproval } },
}

const WorkerCreateRequest = {
    config: { security: securityAccess.engine() },
    schema: { body: CreateAgentApprovalRequestBody, response: { [StatusCodes.CREATED]: CreateAgentApprovalResponse } },
}
