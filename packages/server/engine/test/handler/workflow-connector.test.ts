import { tryParseFriendlyConnectorError } from '@fema/core-utils'
import { WorkflowAction, ExecutionStatus } from '@fema/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { connectorExecutor } from '../../src/lib/handler/connector-executor'
import { buildConnectorAction, generateMockEngineConstants } from './test-helper'

describe('connectorExecutor', () => {

    it('should execute data mapper successfully', async () => {
        const result = await connectorExecutor.handle({
            action: buildConnectorAction({
                name: 'data_mapper',
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
            }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.data_mapper.output).toEqual({ 'key': 3 })
    })

    it('should execute fail gracefully when connectors fail', async () => {
        const result = await connectorExecutor.handle({
            action: buildConnectorAction({
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
            }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })

        const verdict = result.verdict
        expect(verdict.status).toBe(ExecutionStatus.FAILED)
        if (verdict.status !== ExecutionStatus.FAILED) {
            throw new Error('Expected a FAILED verdict')
        }
        expect(verdict.failedStep.name).toBe('send_http')
        expect(verdict.failedStep.displayName).toBe('Your Action Name')

        const failedStepError = tryParseFriendlyConnectorError(verdict.failedStep.message)
        expect(failedStepError?.status).toBe(404)
        expect(failedStepError?.apiMessage).toBe('Route not found')

        expect(result.steps.send_http.status).toBe('FAILED')
        const error = tryParseFriendlyConnectorError(result.steps.send_http.errorMessage)
        expect(error?.status).toBe(404)
        expect(error?.errorName).toBe('HttpError')
        expect(error?.message).toBe('Route not found')
        expect(error?.apiMessage).toBe('Route not found')
        expect(error?.responseBody).toEqual({
            statusCode: 404,
            error: 'Not Found',
            message: 'Route not found',
        })
    }, 30000)
    it('should skip connector action', async () => {
        const result = await workflowExecutor.execute({
            action: buildConnectorAction({
                name: 'data_mapper',
                input: {},
                skip: true,
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
            }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.data_mapper).toBeUndefined()
    })
    it('should skip connector action in workflow', async () => {
        const workflow: WorkflowAction = {
            ...buildConnectorAction({
                name: 'data_mapper',
                input: {
                    mapping: {
                        'key': '{{ 1 + 2 }}',
                    },
                },
                skip: false,
                connectorName: '@fema/connector-data-mapper',
                actionName: 'advanced_mapping',
            }),
            nextAction: {
                ...buildConnectorAction({
                    name: 'send_http',
                    connectorName: '@fema/connector-http',
                    actionName: 'send_request',
                    input: {},
                    skip: true,
                }),
                nextAction: undefined,
            },
        }
        const result = await workflowExecutor.execute({
            action: workflow, executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.data_mapper.output).toEqual({ 'key': 3 })
        expect(result.steps.send_http).toBeUndefined()
    })
})
