import { Permission, PrincipalType, TestExecutionRequestBody, WebsocketClientEvent, WebsocketServerEvent } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { websocketService } from '../core/websockets.service'
import { executionService } from './execution/execution-service'
import { flowVersionController } from './flow/flow-version.controller'
import { flowController } from './flow/flow.controller'
import { sampleDataController } from './step-run/sample-data.controller'

export const flowModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(flowVersionController, { prefix: '/v1/flows' })
    await app.register(flowController, { prefix: '/v1/flows' })
    await app.register(sampleDataController, { prefix: '/v1/sample-data' })
    // Membership-only by design: a test run mirrors the membership-only
    // /v1/sample-data/test-step route. Only production manual runs require WRITE_RUN.
    websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.TEST_EXECUTION, (socket) => {
        return async (data: TestExecutionRequestBody, principal, workspaceId) => {
            const execution = await executionService(app.log).test({
                workspaceId,
                flowVersionId: data.flowVersionId,
                triggeredBy: principal.id,
            })
            socket.emit(WebsocketClientEvent.TEST_EXECUTION_STARTED, execution)
        }
    })
    websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.MANUAL_TRIGGER_RUN_STARTED, (socket) => {
        return async (data: TestExecutionRequestBody, principal, workspaceId) => {
            const execution = await executionService(app.log).startManualTrigger({
                workspaceId,
                flowVersionId: data.flowVersionId,
                triggeredBy: principal.id,
            })
            socket.emit(WebsocketClientEvent.MANUAL_TRIGGER_RUN_STARTED, execution)
        }
    }, Permission.WRITE_RUN)
}
