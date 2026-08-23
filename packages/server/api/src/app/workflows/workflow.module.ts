import { Permission, PrincipalType, TestExecutionRequestBody, WebsocketClientEvent, WebsocketServerEvent } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { websocketService } from '../core/websockets.service'
import { executionService } from './execution/execution-service'
import { sampleDataController } from './step-run/sample-data.controller'
import { workflowVersionController } from './workflow/workflow-version.controller'
import { workflowController } from './workflow/workflow.controller'

export const workflowModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(workflowVersionController, { prefix: '/v1/workflows' })
    await app.register(workflowController, { prefix: '/v1/workflows' })
    await app.register(sampleDataController, { prefix: '/v1/sample-data' })
    // Membership-only by design: a test run mirrors the membership-only
    // /v1/sample-data/test-step route. Only production manual runs require WRITE_RUN.
    websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.TEST_EXECUTION, (socket) => {
        return async (data: TestExecutionRequestBody, principal, workspaceId) => {
            const execution = await executionService(app.log).test({
                workspaceId,
                workflowVersionId: data.workflowVersionId,
                triggeredBy: principal.id,
            })
            socket.emit(WebsocketClientEvent.TEST_EXECUTION_STARTED, execution)
        }
    })
    websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.MANUAL_TRIGGER_RUN_STARTED, (socket) => {
        return async (data: TestExecutionRequestBody, principal, workspaceId) => {
            const execution = await executionService(app.log).startManualTrigger({
                workspaceId,
                workflowVersionId: data.workflowVersionId,
                triggeredBy: principal.id,
            })
            socket.emit(WebsocketClientEvent.MANUAL_TRIGGER_RUN_STARTED, execution)
        }
    }, Permission.WRITE_RUN)
}
