import { ExecutionStatus } from '@fema-ipaas/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { buildConnectorAction, generateMockEngineConstants } from './test-helper'

describe('workflow with response', () => {

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

        const result = await workflowExecutor.execute({
            action: buildConnectorAction({
                name: 'http',
                connectorName: '@fema-ipaas/connector-webhook',
                actionName: 'return_response',
                input,
            }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.SUCCEEDED,
            stopResponse: response,
        })
        expect(result.steps.http.output).toEqual(response)
    })

})
