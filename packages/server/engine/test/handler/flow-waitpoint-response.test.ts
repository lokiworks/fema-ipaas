import { ExecutionStatus } from '@fema/shared'
import { vi } from 'vitest'
import { FlowExecutorContext } from '../../src/lib/handler/context/flow-execution-context'
import { flowExecutor } from '../../src/lib/handler/flow-executor'
import { EngineApiStub, startEngineApiStub } from '../helpers/engine-api-stub'
import { buildConnectorAction, generateMockEngineConstants } from './test-helper'

const { mockSendFlowResponse } = vi.hoisted(() => ({
    mockSendFlowResponse: vi.fn().mockResolvedValue(undefined),
}))


vi.mock('../../src/lib/api/engine-run-api', () => ({
    engineRunApi: {
        sendFlowResponse: mockSendFlowResponse,
    },
}))

describe('flow waitpoint response propagation', () => {
    let engineApi: EngineApiStub

    beforeEach(async () => {
        engineApi = await startEngineApiStub({
            'POST /v1/waitpoints': { id: 'mock-waitpoint-id', resumeUrl: 'http://localhost/resume' },
        })
    })

    afterEach(async () => {
        await engineApi.close()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should send responseToSend via workerSocket when createWaitpoint is used with responseToSend', async () => {
        const responseBody = { hello: 'world' }
        const responseHeaders = { 'x-custom': 'header' }

        const action = buildConnectorAction({
            name: 'http',
            connectorName: '@fema/connector-webhook',
            actionName: 'return_response_and_wait_for_next_webhook',
            input: {
                responseType: 'json',
                fields: {
                    status: 200,
                    headers: responseHeaders,
                    body: responseBody,
                },
            },
        })

        const result = await flowExecutor.execute({
            action,
            executionState: FlowExecutorContext.empty(),
            constants: generateMockEngineConstants({
                internalApiUrl: engineApi.url,
                triggerConnectorName: '@fema/connector-webhook',
                workerHandlerId: 'test-handler-id',
                httpRequestId: 'test-request-id',
            }),
        })

        expect(result.verdict).toEqual({
            status: ExecutionStatus.PAUSED,
        })

        expect(mockSendFlowResponse).toHaveBeenCalledWith({
            apiUrl: expect.any(String),
            engineToken: expect.any(String),
            request: {
                workerHandlerId: 'test-handler-id',
                httpRequestId: 'test-request-id',
                runResponse: {
                    status: 200,
                    body: responseBody,
                    headers: expect.objectContaining(responseHeaders),
                },
            },
        })
        const sentHeaders = mockSendFlowResponse.mock.calls[0][0].request.runResponse.headers
        expect(typeof sentHeaders['x-fema-resume-webhook-url']).toBe('string')
        expect(sentHeaders['x-fema-resume-webhook-url']).toMatch(/^https?:\/\//)
    })

    it('should not call sendFlowResponse when triggerConnectorName does not match', async () => {
        const action = buildConnectorAction({
            name: 'http',
            connectorName: '@fema/connector-webhook',
            actionName: 'return_response_and_wait_for_next_webhook',
            input: {
                responseType: 'json',
                fields: {
                    status: 200,
                    headers: {},
                    body: { test: true },
                },
            },
        })

        const result = await flowExecutor.execute({
            action,
            executionState: FlowExecutorContext.empty(),
            constants: generateMockEngineConstants({
                internalApiUrl: engineApi.url,
                triggerConnectorName: 'some-other-connector',
                workerHandlerId: 'test-handler-id',
                httpRequestId: 'test-request-id',
            }),
        })

        expect(result.verdict).toEqual({
            status: ExecutionStatus.PAUSED,
        })
        expect(mockSendFlowResponse).not.toHaveBeenCalled()
    })
})
