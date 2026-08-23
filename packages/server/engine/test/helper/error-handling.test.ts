import { ExecutionStatus } from '@fema/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { runWithExponentialBackoff } from '../../src/lib/helper/error-handling'
import { buildCodeAction, generateMockEngineConstants } from '../handler/test-helper'

describe('runWithExponentialBackoff', () => {
    const executionState = WorkflowExecutorContext.empty()
    const action = buildCodeAction({
        name: 'runtime',
        input: {},
        errorHandlingOptions: {
            continueOnFailure: {
                value: false,
            },
            retryOnFailure: {
                value: true,
            },
        },
    })
    const constants = generateMockEngineConstants()
    const requestFunction = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterAll(() => {
        vi.clearAllMocks()
    })

    it('should return resultExecutionState when verdict is not FAILED', async () => {
        const resultExecutionState = WorkflowExecutorContext.empty().setVerdict({
            status: ExecutionStatus.SUCCEEDED,
            stopResponse: undefined,
        })
        requestFunction.mockResolvedValue(resultExecutionState)

        const output = await runWithExponentialBackoff(executionState, action, constants, requestFunction)

        expect(output).toEqual(resultExecutionState)
        expect(requestFunction).toHaveBeenCalledWith({ action, executionState, constants })
    })


    it('should retry and return resultExecutionState when verdict is FAILED and retry is enabled', async () => {
        const resultExecutionState = WorkflowExecutorContext.empty().setVerdict({
            status: ExecutionStatus.FAILED,
            failedStep: {
                name: 'runtime',
                displayName: 'runtime',
                message: 'Custom Runtime Error',
            },
        })

        requestFunction.mockResolvedValue(resultExecutionState)

        const output = await runWithExponentialBackoff(executionState, action, constants, requestFunction)

        expect(output).toEqual(resultExecutionState)
        // Mock applies for the first attempt and second attempt is a real call which return success
        expect(requestFunction).toHaveBeenCalledTimes(2)
        expect(requestFunction).toHaveBeenCalledWith({ action, executionState, constants })
        expect(requestFunction).toHaveBeenCalledWith({ action, executionState, constants })
    })

    it('should not retry and return resultExecutionState when verdict is FAILED but retry is disabled', async () => {
        const resultExecutionState = WorkflowExecutorContext.empty().setVerdict({
            status: ExecutionStatus.FAILED,
            failedStep: {
                name: 'runtime',
                displayName: 'runtime',
                message: 'Custom Runtime Error',
            },
        })

        requestFunction.mockResolvedValue(resultExecutionState)


        const actionWithDisabledRetry = buildCodeAction({
            name: 'runtime',
            input: {},
            errorHandlingOptions: {
                continueOnFailure: {
                    value: false,
                },
                retryOnFailure: {
                    value: false,
                },
            },
        })

        const output = await runWithExponentialBackoff(executionState, actionWithDisabledRetry, constants, requestFunction)

        expect(output).toEqual(resultExecutionState)
        expect(requestFunction).toHaveBeenCalledTimes(1)
        expect(requestFunction).toHaveBeenCalledWith({ action: actionWithDisabledRetry, executionState, constants })

    })

})