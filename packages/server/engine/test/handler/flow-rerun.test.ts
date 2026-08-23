import { ExecutionStatus } from '@fema/shared'
import { FlowExecutorContext } from '../../src/lib/handler/context/flow-execution-context'
import { flowExecutor } from '../../src/lib/handler/flow-executor'
import { buildConnectorAction, generateMockEngineConstants } from './test-helper'

const failedHttpAction = buildConnectorAction({
    name: 'send_http',
    connectorName: '@fema/connector-http',
    actionName: 'send_request',
    input: {
        'url': `${process.env.FEMA_TEST_FIXTURE_URL}/api/v1/asd`,
        'method': 'GET',
        'headers': {},
        'body_type': 'none', 
        'body': {}, 
        'queryParams': {},
    },
})

const successHttpAction =  buildConnectorAction({
    name: 'send_http',
    connectorName: '@fema/connector-http',
    actionName: 'send_request',
    input: {
        'url': `${process.env.FEMA_TEST_FIXTURE_URL}/api/v1/ok`,
        'method': 'GET',
        'headers': {},
        'body_type': 'none', 
        'body': {}, 
        'queryParams': {},
    },
})


describe('flow retry', () => {
    it('should retry entire flow', async () => {
        const context = FlowExecutorContext.empty()

        const failedResult = await flowExecutor.execute({
            action: failedHttpAction, executionState: context, constants: generateMockEngineConstants(),
        })
        const retryEntireFlow = await flowExecutor.execute({
            action: successHttpAction, executionState: context, constants: generateMockEngineConstants(),
        })
        expect(failedResult.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(retryEntireFlow.verdict.status).toBe(ExecutionStatus.RUNNING)
    }, 10000)

    it('should retry flow from failed step', async () => {
        const context = FlowExecutorContext.empty()

        const failedResult = await flowExecutor.execute({
            action: failedHttpAction, executionState: context, constants: generateMockEngineConstants(),
        })

        const retryFromFailed = await flowExecutor.execute({
            action: successHttpAction, executionState: context, constants: generateMockEngineConstants({}),
        })
        expect(failedResult.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(retryFromFailed.verdict.status).toBe(ExecutionStatus.RUNNING)
    }, 10000)
})
