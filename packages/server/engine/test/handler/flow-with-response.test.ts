import { FlowRunStatus } from '@fema/shared'
import { FlowExecutorContext } from '../../src/lib/handler/context/flow-execution-context'
import { flowExecutor } from '../../src/lib/handler/flow-executor'
import { buildConnectorAction, generateMockEngineConstants } from './test-helper'

describe('flow with response', () => {

    it('should execute return response successfully', async () => {
        const input = {
            responseType: 'json',
            fields: {
                status: 200,
                headers: {
                    'random': 'header',
                },
                body: {
                    'hello': 'world',
                },
            },
            respond: 'stop',
        }
        const response = {
            status: 200,
            headers: {
                'random': 'header',
            },
            body: {
                'hello': 'world',
            },
        }

        const result = await flowExecutor.execute({
            action: buildConnectorAction({
                name: 'http',
                connectorName: '@fema/connector-webhook',
                actionName: 'return_response',
                input,
            }), executionState: FlowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: FlowRunStatus.SUCCEEDED,
            stopResponse: response,
        })
        expect(result.steps.http.output).toEqual(response)
    })

})
