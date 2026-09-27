import { ActionErrorHandlingOptions, CodeAction, ErrorCodeOperator, ErrorStrategyMode, ExecutionStatus, StepOutputStatus, WorkflowAction } from '@fema-ipaas/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { workflowExecutor } from '../../src/lib/handler/workflow-executor'
import { errorStrategyTiming, runWithExponentialBackoff } from '../../src/lib/helper/error-handling'
import { EngineApiStub, startEngineApiStub } from '../helpers/engine-api-stub'
import { buildCodeAction, generateMockEngineConstants } from './test-helper'

describe('error handling strategies', () => {
    let engineApi: EngineApiStub

    beforeEach(async () => {
        engineApi = await startEngineApiStub({})
        vi.spyOn(errorStrategyTiming, 'sleep').mockResolvedValue()
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await engineApi.close()
    })

    function failingStep({ errorHandlingOptions, nextAction, onSuccess, onFailure }: FailingStepParams): CodeAction {
        return {
            ...buildCodeAction({ name: 'runtime', input: {}, errorHandlingOptions, nextAction }),
            continueOnFailureBranches: onSuccess === undefined && onFailure === undefined ? undefined : { onSuccess, onFailure },
        }
    }

    async function run(action: WorkflowAction): Promise<WorkflowExecutorContext> {
        return workflowExecutor.execute({
            action,
            executionState: WorkflowExecutorContext.empty(),
            constants: generateMockEngineConstants({ internalApiUrl: engineApi.url }),
        })
    }

    it('stops the run by default', async () => {
        const result = await run(failingStep({
            errorHandlingOptions: { strategy: { mode: ErrorStrategyMode.STOP } },
            nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
        }))

        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(result.getStepOutput('echo_step')).toBeUndefined()
    })

    it('ignores the failure and continues with the next step', async () => {
        const result = await run(failingStep({
            errorHandlingOptions: { strategy: { mode: ErrorStrategyMode.IGNORE } },
            nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
        }))

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.getStepOutput('runtime')?.status).toBe(StepOutputStatus.FAILED)
        expect(result.getStepOutput('echo_step')?.status).toBe(StepOutputStatus.SUCCEEDED)
    })

    it('runs the failure branch and then continues with the following steps', async () => {
        const result = await run(failingStep({
            errorHandlingOptions: { strategy: { mode: ErrorStrategyMode.BRANCH }, continueOnFailure: { value: true } },
            onFailure: buildCodeAction({ name: 'echo_step_1', input: { handled: true } }),
            nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
        }))

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.getStepOutput('echo_step_1')?.output).toEqual({ handled: true })
        expect(result.getStepOutput('echo_step')?.status).toBe(StepOutputStatus.SUCCEEDED)
    })

    it('takes the success branch when a rule ignores the error even though branches exist', async () => {
        const result = await run(failingStep({
            errorHandlingOptions: {
                strategy: { mode: ErrorStrategyMode.BRANCH },
                rules: [{ id: 'r1', name: 'ignore generic failures', operator: ErrorCodeOperator.EQUALS_ANY, codes: ['STEP_FAILED'], strategy: { mode: ErrorStrategyMode.IGNORE } }],
            },
            onSuccess: buildCodeAction({ name: 'echo_step_1', input: {} }),
            onFailure: buildCodeAction({ name: 'echo_step', input: {} }),
        }))

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.getStepOutput('echo_step_1')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(result.getStepOutput('echo_step')).toBeUndefined()
    })

    it('falls back to the default strategy when no custom rule matches', async () => {
        const result = await run(failingStep({
            errorHandlingOptions: {
                strategy: { mode: ErrorStrategyMode.STOP },
                rules: [{ id: 'r1', name: 'rate limit', operator: ErrorCodeOperator.EQUALS_ANY, codes: ['429'], strategy: { mode: ErrorStrategyMode.IGNORE } }],
            },
            nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
        }))

        expect(result.verdict.status).toBe(ExecutionStatus.FAILED)
    })

    it('retries the configured number of times with the configured interval before applying the outcome', async () => {
        const failed = WorkflowExecutorContext.empty().setVerdict({
            status: ExecutionStatus.FAILED,
            failedStep: { name: 'runtime', displayName: 'runtime', message: 'Request failed with status code 429' },
        })
        const requestFunction = vi.fn().mockResolvedValue(failed)
        const action = buildCodeAction({
            name: 'runtime',
            input: {},
            errorHandlingOptions: { strategy: { mode: ErrorStrategyMode.RETRY_THEN_STOP, retryAttempts: 2, retryIntervalSeconds: 30 } },
        })

        const output = await runWithExponentialBackoff(WorkflowExecutorContext.empty(), action, generateMockEngineConstants(), requestFunction)

        expect(output.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(requestFunction).toHaveBeenCalledTimes(3)
        expect(errorStrategyTiming.sleep).toHaveBeenCalledWith(30_000)
    })

    it('does not retry when the matching rule has no retry', async () => {
        const failed = WorkflowExecutorContext.empty().setVerdict({
            status: ExecutionStatus.FAILED,
            failedStep: { name: 'runtime', displayName: 'runtime', message: 'Request failed with status code 400' },
        })
        const requestFunction = vi.fn().mockResolvedValue(failed)
        const action = buildCodeAction({
            name: 'runtime',
            input: {},
            errorHandlingOptions: {
                strategy: { mode: ErrorStrategyMode.RETRY_THEN_STOP },
                rules: [{ id: 'r1', name: 'bad input', operator: ErrorCodeOperator.STARTS_WITH_ANY, codes: ['HTTP_4'], strategy: { mode: ErrorStrategyMode.STOP } }],
            },
        })

        await runWithExponentialBackoff(WorkflowExecutorContext.empty(), action, generateMockEngineConstants(), requestFunction)

        expect(requestFunction).toHaveBeenCalledTimes(1)
    })

    it('keeps the legacy continue-on-failure behaviour when no strategy is set', async () => {
        const result = await run(failingStep({
            errorHandlingOptions: { continueOnFailure: { value: true }, retryOnFailure: { value: false } },
            onFailure: buildCodeAction({ name: 'echo_step_1', input: {} }),
            nextAction: buildCodeAction({ name: 'echo_step', input: {} }),
        }))

        expect(result.verdict.status).toBe(ExecutionStatus.RUNNING)
        expect(result.getStepOutput('echo_step_1')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(result.getStepOutput('echo_step')?.status).toBe(StepOutputStatus.SUCCEEDED)
        expect(errorStrategyTiming.sleep).not.toHaveBeenCalled()
    })
})

type FailingStepParams = {
    errorHandlingOptions: ActionErrorHandlingOptions
    nextAction?: WorkflowAction
    onSuccess?: WorkflowAction
    onFailure?: WorkflowAction
}
