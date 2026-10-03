import { Permission } from '@fema-ipaas/core-utils'
import {
    AiModelConnection,
    AiUsageSummary,
    ApplyWorkflowPlanRequestBody,
    ApplyWorkflowPlanResponse,
    CopilotRequestBody,
    CopilotResponse,
    GenerateWorkflowPlanRequestBody,
    ListAiUsageRequestQuery,
    PrincipalType,
    ReportAiUsageRequestBody,
    SuggestFieldMappingRequestBody,
    SuggestFieldMappingResponse,
    WorkflowPlan,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { aiCopilotService } from './ai-copilot.service'
import { aiMappingService } from './ai-mapping.service'
import { aiModelService } from './ai-model.service'
import { aiPlanService } from './ai-plan.service'
import { aiUsageService } from './ai-usage.service'

export const aiController: FastifyPluginAsyncZod = async (app) => {
    app.get('/model-connections', ModelConnectionsRequest, async (request): Promise<AiModelConnection[]> => {
        return aiModelService(request.log).listModelConnections({ projectId: request.projectId, tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.post('/workflow-plans', GeneratePlanRequest, async (request): Promise<WorkflowPlan> => {
        return aiPlanService(request.log).generate({ request: request.body, tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.post('/workflow-plans/apply', ApplyPlanRequest, async (request, reply) => {
        const result = await aiPlanService(request.log).apply({ request: request.body, tenantId: request.principal.tenant.id, userId: request.principal.id })
        await reply.status(StatusCodes.CREATED).send(result)
    })

    app.post('/copilot', CopilotRequest, async (request): Promise<CopilotResponse> => {
        return aiCopilotService(request.log).ask({ request: request.body, tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.post('/field-mapping', FieldMappingRequest, async (request): Promise<SuggestFieldMappingResponse> => {
        return aiMappingService(request.log).suggest({ request: request.body, tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.get('/usage', UsageRequest, async (request): Promise<AiUsageSummary> => {
        return aiUsageService(request.log).summary({
            projectId: request.projectId,
            createdAfter: request.query.createdAfter,
            createdBefore: request.query.createdBefore,
        })
    })
}

export const aiWorkerController: FastifyPluginAsyncZod = async (app) => {
    app.post('/ai-usage', ReportUsageRequest, async (request, reply) => {
        const principal = request.principal
        if (principal.type !== PrincipalType.ENGINE || !principal.projectId) {
            await reply.status(StatusCodes.FORBIDDEN).send()
            return
        }
        await aiUsageService(request.log).record({
            projectId: principal.projectId,
            feature: request.body.feature,
            provider: request.body.provider,
            model: request.body.model,
            usage: { inputTokens: request.body.inputTokens, outputTokens: request.body.outputTokens },
            workflowId: request.body.workflowId,
            executionId: request.body.executionId,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const ModelConnectionsRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['ai'], querystring: z.object({ projectId: z.string() }), response: { [StatusCodes.OK]: z.array(AiModelConnection) } },
}

const GeneratePlanRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['ai'], body: GenerateWorkflowPlanRequestBody, response: { [StatusCodes.OK]: WorkflowPlan } },
}

const ApplyPlanRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['ai'], body: ApplyWorkflowPlanRequestBody, response: { [StatusCodes.CREATED]: ApplyWorkflowPlanResponse } },
}

const CopilotRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['ai'], body: CopilotRequestBody, response: { [StatusCodes.OK]: CopilotResponse } },
}

const FieldMappingRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['ai'], body: SuggestFieldMappingRequestBody, response: { [StatusCodes.OK]: SuggestFieldMappingResponse } },
}

const UsageRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_PROJECT, { type: ProjectResourceType.QUERY }) },
    schema: { tags: ['ai'], querystring: ListAiUsageRequestQuery, response: { [StatusCodes.OK]: AiUsageSummary } },
}

const ReportUsageRequest = {
    config: { security: securityAccess.engine() },
    schema: { body: ReportAiUsageRequestBody },
}
