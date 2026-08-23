import { Connector, ConnectorAuthProperty } from '@fema-ipaas/connector-sdk'
import { apId, ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { LATEST_JOB_DATA_SCHEMA_VERSION, RunEnvironment, WorkerJobType, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { domainHelper } from '../../helper/domain-helper'
import { rejectedPromiseHandler } from '../../helper/promise-handler'
import { webhookService, WebhookWorkflowVersionToRun } from '../../webhooks/webhook.service'
import { jobQueue, JobType } from '../../workers/job-queue/job-queue'
import { payloadOffloader } from '../../workers/payload-offloader'
import { workflowService } from '../../workflows/workflow/workflow.service'
import { workspaceService } from '../../workspace/workspace-service'
import { triggerSourceService } from '../trigger-source/trigger-source-service'
import { appEventRoutingService } from './app-event-routing.service'

const appWebhooks: Record<string, Connector<ConnectorAuthProperty | ConnectorAuthProperty[] | undefined>> = {}
const connectorNames: Record<string, string> = {}

export const appEventRoutingModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(appEventRoutingController, { prefix: '/v1/app-events' })
}

export const appEventRoutingController: FastifyPluginAsyncZod = async (
    fastify,
) => {
    fastify.all(
        '/:connectorUrl',
        {
            config: {
                rawBody: true,
                security: securityAccess.public(),
            },
        },
        async (
            request: FastifyRequest<{
                Body: unknown
                Params: {
                    connectorUrl: string
                }
            }>,
            requestReply,
        ) => {
            const connectorUrl = request.params.connectorUrl
            const payload = {
                headers: request.headers as Record<string, string>,
                body: request.body,
                rawBody: request.rawBody,
                method: request.method,
                queryParams: request.query as Record<string, string>,
            }
            const connector = appWebhooks[connectorUrl]
            if (isNil(connector)) {
                throw new ApplicationError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        entityType: 'connector',
                        entityId: connectorUrl,
                        message: 'Connector is not found in app event routing',
                    },
                })
            }
            const appName = connectorNames[connectorUrl]
            assertNotNullOrUndefined(connector.events, 'Event is possible in this connector')
            const { reply, event, identifierValue } = connector.events.parseAndReply({
                payload,
                server: {
                    publicUrl: await domainHelper.getPublicUrl({ path: '' }),
                },
            })
            if (!isNil(reply)) {
                request.log.info(
                    {
                        reply,
                        connector: connectorUrl,
                    },
                    '[AppEventRoutingController#event] reply',
                )
                return requestReply
                    .status(StatusCodes.OK)
                    .headers(reply?.headers ?? {})
                    .send(reply?.body ?? {})
            }
            request.log.info(
                {
                    event,
                    identifierValue,
                },
                '[AppEventRoutingController#event] event',
            )
            if (isNil(event) || isNil(identifierValue)) {
                return requestReply.status(StatusCodes.BAD_REQUEST).send({})
            }
            const listeners = await appEventRoutingService.listListeners({
                appName,
                event,
                identifierValue,
            })
            const eventsQueue = listeners.map(async (listener) => {
                const requestId = apId()
                const workflow = await workflowService(request.log).getOne({ id: listener.workflowId, workspaceId: listener.workspaceId })
                if (isNil(workflow)) {
                    return
                }
                const isSimulating = await triggerSourceService(request.log).existsByWorkflowId({
                    workflowId: listener.workflowId,
                    simulate: true,
                })
                const workflowVersionIdToRun = await webhookService.getWorkflowVersionIdToRun(
                    isSimulating ? WebhookWorkflowVersionToRun.LATEST : WebhookWorkflowVersionToRun.LOCKED_FALL_BACK_TO_LATEST,
                    workflow,
                )
                const tenantId = await workspaceService(request.log).getTenantId(listener.workspaceId)
                const jobPayload = await payloadOffloader.offloadPayload(request.log, payload, listener.workspaceId, tenantId)
                return jobQueue(request.log).add({
                    id: requestId,
                    type: JobType.ONE_TIME,
                    data: {
                        tenantId,
                        workspaceId: listener.workspaceId,
                        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                        requestId,
                        payload: jobPayload,
                        workflowId: listener.workflowId,
                        jobType: WorkerJobType.EXECUTE_WEBHOOK,
                        runEnvironment: isSimulating ? RunEnvironment.TESTING : RunEnvironment.PRODUCTION,
                        saveSampleData: isSimulating,
                        workflowVersionIdToRun,
                        execute: workflow.status === WorkflowStatus.ENABLED,
                    },
                })
            })
            rejectedPromiseHandler(Promise.all(eventsQueue), request.log)
            return requestReply.status(StatusCodes.OK).send({})
        },
    )
}
