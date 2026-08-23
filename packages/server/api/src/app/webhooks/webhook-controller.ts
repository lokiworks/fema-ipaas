
import { wideEvent } from '@fema-ipaas/server-utils'
import {
    RAW_PAYLOAD_HEADER,
    WebhookUrlParams,
    WebsocketClientEvent,
} from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { triggerSourceService } from '../trigger/trigger-source/trigger-source-service'
import { convertRequest, extractHeaderFromRequest } from './webhook-request-converter'
import { webhookService, WebhookWorkflowVersionToRun } from './webhook.service'

export const webhookController: FastifyPluginAsyncZod = async (app) => {

    app.all(
        '/:workflowId/sync',
        WEBHOOK_PARAMS,
        async (request: FastifyRequest<{ Params: WebhookUrlParams }>, reply) => {
            wideEvent.set({
                workflow: { id: request.params.workflowId },
                webhook: {
                    method: request.method,
                    async: false,
                },
            })
            const response = await webhookService.handleWebhook({
                data: (workspaceId: string) => convertRequest(request, workspaceId, request.params.workflowId),
                logger: request.log,
                workflowId: request.params.workflowId,
                async: false,
                workflowVersionToRun: WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST,
                saveSampleData: await triggerSourceService(request.log).existsByWorkflowId({
                    workflowId: request.params.workflowId,
                    simulate: true,
                }),
                execute: true,
                ...extractRawPayload(request),
                ...extractHeaderFromRequest(request),
            })
            wideEvent.set({ webhook: { responseStatus: response.status } })
            await reply
                .status(response.status)
                .headers(response.headers)
                .send(response.body)
        },
    )

    app.all(
        '/:workflowId',
        WEBHOOK_PARAMS,
        async (request: FastifyRequest<{ Params: WebhookUrlParams }>, reply) => {
            wideEvent.set({
                workflow: { id: request.params.workflowId },
                webhook: {
                    method: request.method,
                    async: true,
                },
            })
            const response = await webhookService.handleWebhook({
                data: (workspaceId: string) => convertRequest(request, workspaceId, request.params.workflowId),
                logger: request.log,
                workflowId: request.params.workflowId,
                async: true,
                saveSampleData: await triggerSourceService(request.log).existsByWorkflowId({
                    workflowId: request.params.workflowId,
                    simulate: true,
                }),
                workflowVersionToRun: WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST,
                execute: true,
                ...extractRawPayload(request),
                ...extractHeaderFromRequest(request),
            })
            wideEvent.set({ webhook: { responseStatus: response.status } })
            await reply
                .status(response.status)
                .headers(response.headers)
                .send(response.body)
        },
    )

    app.all('/:workflowId/draft/sync', WEBHOOK_PARAMS, async (request, reply) => {
        const response = await webhookService.handleWebhook({
            data: (workspaceId: string) => convertRequest(request, workspaceId, request.params.workflowId),
            logger: request.log,
            workflowId: request.params.workflowId,
            async: false,
            saveSampleData: true,
            workflowVersionToRun: WebhookWorkflowVersionToRun.LATEST,
            execute: true,
            onRunCreated: (run) => {
                app.io.to(run.workspaceId).emit(WebsocketClientEvent.TEST_EXECUTION_STARTED, run)
            },
            ...extractHeaderFromRequest(request),
        })
        await reply
            .status(response.status)
            .headers(response.headers)
            .send(response.body)
    })

    app.all('/:workflowId/draft', WEBHOOK_PARAMS, async (request, reply) => {
        const response = await webhookService.handleWebhook({
            data: (workspaceId: string) => convertRequest(request, workspaceId, request.params.workflowId),
            logger: request.log,
            workflowId: request.params.workflowId,
            async: true,
            saveSampleData: true,
            workflowVersionToRun: WebhookWorkflowVersionToRun.LATEST,
            execute: true,
            ...extractHeaderFromRequest(request),
        })
        await reply
            .status(response.status)
            .headers(response.headers)
            .send(response.body)
    })

    app.all('/:workflowId/test', WEBHOOK_PARAMS, async (request, reply) => {
        const response = await webhookService.handleWebhook({
            data: (workspaceId: string) => convertRequest(request, workspaceId, request.params.workflowId),
            logger: request.log,
            workflowId: request.params.workflowId,
            async: true,
            saveSampleData: true,
            workflowVersionToRun: WebhookWorkflowVersionToRun.LATEST,
            execute: false,
            ...extractHeaderFromRequest(request),
        })
        await reply
            .status(response.status)
            .headers(response.headers)
            .send(response.body)
    })

}


const WEBHOOK_PARAMS = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        params: WebhookUrlParams,
    },
}


function extractRawPayload(request: FastifyRequest): { payload?: Record<string, unknown> } {
    const isRawPayload = request.headers[RAW_PAYLOAD_HEADER] === 'true'
        && request.headers.authorization
        && request.body != null
        && !Array.isArray(request.body)
        && !Buffer.isBuffer(request.body)
    if (isRawPayload) {
        return { payload: request.body as Record<string, unknown> }
    }
    return {}
}
