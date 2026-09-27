import { EntityId } from '@fema-ipaas/core-utils'
import {
    CreateRunMonitorViewRequestBody,
    PrincipalType,
    RunMonitorAiUsage,
    RunMonitorOptions,
    RunMonitorQuery,
    RunMonitorSummary,
    RunMonitorView,
    UpdateRunMonitorViewRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { runMonitorAiService } from './run-monitor-ai.service'
import { runMonitorViewService } from './run-monitor-view.service'
import { runMonitorService } from './run-monitor.service'

export const runMonitorController: FastifyPluginAsyncZod = async (app) => {
    app.get('/summary', SummaryRequest, async (request): Promise<RunMonitorSummary> => {
        const service = runMonitorService(request.log)
        const scope = await service.resolveScope({ userId: request.principal.id, tenantId: request.principal.tenant.id, query: request.query, now: new Date() })
        return service.summary(scope)
    })

    app.get('/ai-usage', AiUsageRequest, async (request): Promise<RunMonitorAiUsage> => {
        const scope = await runMonitorService(request.log).resolveScope({ userId: request.principal.id, tenantId: request.principal.tenant.id, query: request.query, now: new Date() })
        return runMonitorAiService.usage(scope)
    })

    app.get('/options', OptionsRequest, async (request): Promise<RunMonitorOptions> => {
        return runMonitorService(request.log).options({ userId: request.principal.id, tenantId: request.principal.tenant.id })
    })

    app.get('/views', ListViewsRequest, async (request): Promise<RunMonitorView[]> => {
        return runMonitorViewService.list({ tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.post('/views', CreateViewRequest, async (request, reply) => {
        const view = await runMonitorViewService.create({ tenantId: request.principal.tenant.id, userId: request.principal.id, request: request.body })
        await reply.status(StatusCodes.CREATED).send(view)
    })

    app.post('/views/:id', UpdateViewRequest, async (request): Promise<RunMonitorView> => {
        return runMonitorViewService.update({ tenantId: request.principal.tenant.id, userId: request.principal.id, id: request.params.id, request: request.body })
    })

    app.delete('/views/:id', DeleteViewRequest, async (request, reply) => {
        await runMonitorViewService.delete({ tenantId: request.principal.tenant.id, userId: request.principal.id, id: request.params.id })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const IdParams = z.object({ id: EntityId })

const SummaryRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['run-monitor'], querystring: RunMonitorQuery, response: { [StatusCodes.OK]: RunMonitorSummary } },
}

const AiUsageRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['run-monitor'], querystring: RunMonitorQuery, response: { [StatusCodes.OK]: RunMonitorAiUsage } },
}

const OptionsRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['run-monitor'], response: { [StatusCodes.OK]: RunMonitorOptions } },
}

const ListViewsRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['run-monitor'], response: { [StatusCodes.OK]: z.array(RunMonitorView) } },
}

const CreateViewRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['run-monitor'], body: CreateRunMonitorViewRequestBody, response: { [StatusCodes.CREATED]: RunMonitorView } },
}

const UpdateViewRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['run-monitor'], params: IdParams, body: UpdateRunMonitorViewRequestBody, response: { [StatusCodes.OK]: RunMonitorView } },
}

const DeleteViewRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['run-monitor'], params: IdParams },
}
