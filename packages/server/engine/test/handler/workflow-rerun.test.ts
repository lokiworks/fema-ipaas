import { ExecutionStatus } from '@fema-ipaas/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { buildConnectorAction, generateMockEngineConstants } from './test-helper'

const failedHttpAction = buildConnectorAction({
    name: 'send_http',
    connectorName: '@fema-ipaas/connector-http',
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
    connectorName: '@fema-ipaas/connector-http',
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


describe('workflow retry', () => {
    it('should retry entire workflow', async () => {
        const context = WorkflowExecutorContext.empty()

        const failedResult = await workflowExecutor.execute({
            action: failedHttpAction, executionState: context, constants: generateMockEngineConstants(),
        })
        const retryEntireWorkflow = await workflowExecutor.execute({
            action: successHttpAction, executionState: context, constants: generateMockEngineConstants(),
        })
        expect(failedResult.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(retryEntireWorkflow.verdict.status).toBe(ExecutionStatus.RUNNING)
    }, 10000)

    it('should retry workflow from failed step', async () => {
        const context = WorkflowExecutorContext.empty()

        const failedResult = await workflowExecutor.execute({
            action: failedHttpAction, executionState: context, constants: generateMockEngineConstants(),
        })

        const retryFromFailed = await workflowExecutor.execute({
            action: successHttpAction, executionState: context, constants: generateMockEngineConstants({}),
        })
        expect(failedResult.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(retryFromFailed.verdict.status).toBe(ExecutionStatus.RUNNING)
    }, 10000)
})
