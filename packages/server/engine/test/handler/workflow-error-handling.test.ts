
import { tryParseFriendlyConnectorError } from '@fema/core-utils'
import { BranchOperator, ExecutionStatus, RouterExecutionType } from '@fema/shared'
import { codeExecutor } from '../../src/lib/handler/code-executor'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { loopExecutor } from '../../src/lib/handler/loop-executor'
import { connectorExecutor } from '../../src/lib/handler/connector-executor'
import { routerExecuter } from '../../src/lib/handler/router-executor'
import { buildCodeAction, buildConnectorAction, buildRouterWithOneCondition, buildSimpleLoopAction, generateMockEngineConstants } from './test-helper'

describe('code connector with error handling', () => {

    it('should continue on failure when execute code a code that throws an error', async () => {
        const result = await codeExecutor.handle({
            action: buildCodeAction({
                name: 'runtime',
                input: {},
                errorHandlingOptions: {
                    continueOnFailure: {
                        value: true,
                    },
                    retryOnFailure: {
                        value: false,
                    },
                },
            }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })
        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
        expect(result.steps.runtime.status).toEqual('FAILED')
        expect(result.steps.runtime.errorMessage).toContain('Custom Runtime Error')
    })

})

describe('connector with error handling', () => {

    it('should continue on failure when connector fails', async () => {
        const result = await connectorExecutor.handle({
            action: buildConnectorAction({
                name: 'send_http',
                connectorName: '@fema/connector-http',
                actionName: 'send_request',
                input: {
                    'method': 'POST',
                    'url': `${process.env.FEMA_TEST_FIXTURE_URL}/api/v1/flags`,
                    'headers': {},
                    'queryParams': {},
                    'body_type': 'none',
                    'body': {},
                },
                errorHandlingOptions: {
                    continueOnFailure: {
                        value: true,
                    },
                    retryOnFailure: {
                        value: false,
                    },
                },
            }), executionState: WorkflowExecutorContext.empty(), constants: generateMockEngineConstants(),
        })

        expect(result.verdict).toStrictEqual({
            status: ExecutionStatus.RUNNING,
        })
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

    }, 10000)

})

describe('action input resolution failures surface as FAILED step', () => {

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('code-executor: missing connection in input fails the step instead of throwing INTERNAL_ERROR', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))

        const result = await codeExecutor.handle({
            action: buildCodeAction({
                name: 'echo_step',
                input: {
                    storedIds: '{{connections[\'missing-conn\']}}',
                },
            }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.steps.echo_step.status).toBe('FAILED')
        expect(result.steps.echo_step.errorMessage).toContain('connection (missing-conn) not found')
    })

    it('loop-executor: missing connection in items fails the step instead of throwing INTERNAL_ERROR', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))

        const result = await loopExecutor.handle({
            action: buildSimpleLoopAction({
                name: 'loop',
                loopItems: '{{connections[\'missing-conn\']}}',
            }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.steps.loop.status).toBe('FAILED')
        expect(result.steps.loop.errorMessage).toContain('connection (missing-conn) not found')
    })

    it('router-executor: missing connection in branch condition fails the step instead of throwing INTERNAL_ERROR', async () => {
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))

        const result = await routerExecuter.handle({
            action: buildRouterWithOneCondition({
                children: [null],
                conditions: [{
                    operator: BranchOperator.BOOLEAN_IS_TRUE,
                    firstValue: '{{connections[\'missing-conn\']}}',
                }],
                executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
            }),
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants(),
        })

        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.steps.router.status).toBe('FAILED')
        expect(result.steps.router.errorMessage).toContain('connection (missing-conn) not found')
    })

})
