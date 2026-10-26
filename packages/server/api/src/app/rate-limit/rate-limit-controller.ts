import { PrincipalType, ReliabilityEventKind } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { reliabilityEventService } from '../reliability/reliability-event.service'
import { executionRepo } from '../workflows/execution/execution-service'
import { rateLimitService } from './rate-limit-service'

export const rateLimitController: FastifyPluginAsyncZod = async (app) => {
    app.post('/rate-limits/acquire', AcquireRequest, async (request, reply) => {
        if (request.principal.type !== PrincipalType.ENGINE) {
            return reply.status(StatusCodes.FORBIDDEN).send({})
        }
        const event = request.body.event
        if (event && !await executionRepo().existsBy({ id: event.executionId, workflowId: event.workflowId, projectId: request.principal.projectId })) {
            return reply.status(StatusCodes.NOT_FOUND).send({})
        }
        const result = await rateLimitService.acquire({ ...request.body, tenantId: request.principal.tenant.id })
        if (result.waitMs > 0 && event) {
            await reliabilityEventService(request.log).recordEngineEvents({
                projectId: request.principal.projectId,
                executionId: event.executionId,
                events: [{
                    workflowId: event.workflowId,
                    eventKey: event.eventKey,
                    stepName: event.stepName,
                    connectorName: event.connectorName,
                    kind: ReliabilityEventKind.RATE_LIMIT_QUEUED,
                    waitSeconds: Math.ceil(result.waitMs / 1000),
                }],
            })
        }
        return result
    })
}

const AcquireRequest = {
    config: { security: securityAccess.engine() },
    schema: {
        body: z.object({
            bucket: z.string().min(1).max(200),
            scopeKey: z.string().min(1).max(1000),
            perSecond: z.number().positive().max(10000),
            event: z.object({
                workflowId: z.string().max(100),
                executionId: z.string().max(100),
                stepName: z.string().max(200),
                connectorName: z.string().max(200),
                eventKey: z.string().max(300),
            }).optional(),
        }),
        response: { [StatusCodes.OK]: z.object({ waitMs: z.number().nonnegative() }), [StatusCodes.FORBIDDEN]: z.object({}), [StatusCodes.NOT_FOUND]: z.object({}) },
    },
}
