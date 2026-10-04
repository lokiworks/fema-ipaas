import { blockedUntilMarker } from '@fema-ipaas/core-utils'
import { ErrorStrategyMode, ExecutionStatus, ReliabilityEventKind } from '@fema-ipaas/shared'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { errorStrategyTiming, runWithExponentialBackoff } from '../../src/lib/helper/error-handling'
import { buildCodeAction, generateMockEngineConstants } from '../handler/test-helper'

function failedWith(message: string): WorkflowExecutorContext {
    return WorkflowExecutorContext.empty().setVerdict({
        status: ExecutionStatus.FAILED,
        failedStep: { name: 'runtime', displayName: 'runtime', message },
    })
}

function succeeded(): WorkflowExecutorContext {
    return WorkflowExecutorContext.empty().setVerdict({ status: ExecutionStatus.SUCCEEDED, stopResponse: undefined })
}

function rateLimited(seconds: number): string {
    return blockedUntilMarker.attach({ message: 'HTTP 429: the app is calling this endpoint too fast', until: new Date(Date.now() + seconds * 1000) })
}

describe('platform reliability events of a step', () => {
    const constants = generateMockEngineConstants()

    beforeEach(() => {
        vi.spyOn(errorStrategyTiming, 'sleep').mockResolvedValue()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('waits out a short rate limit and records the wait while the step still succeeds', async () => {
        const requestFunction = vi.fn().mockResolvedValueOnce(failedWith(rateLimited(4))).mockResolvedValueOnce(succeeded())
        const action = buildCodeAction({ name: 'runtime', input: {} })

        const output = await runWithExponentialBackoff(WorkflowExecutorContext.empty(), action, constants, requestFunction)

        expect(output.verdict.status).toBe(ExecutionStatus.SUCCEEDED)
        expect(requestFunction).toHaveBeenCalledTimes(2)
        expect(errorStrategyTiming.sleep).toHaveBeenCalledTimes(1)
        expect(output.reliabilityEvents).toHaveLength(1)
        expect(output.reliabilityEvents[0]).toMatchObject({
            kind: ReliabilityEventKind.RATE_LIMIT_QUEUED,
            stepName: 'runtime',
            workflowId: constants.workflowId,
            errorCode: 'HTTP_429',
        })
        expect(output.reliabilityEvents[0].eventKey).toContain(constants.executionId)
    })

    it('gives up after the queue limit and keeps the failure with every wait recorded', async () => {
        const requestFunction = vi.fn().mockResolvedValue(failedWith(rateLimited(4)))
        const action = buildCodeAction({ name: 'runtime', input: {} })

        const output = await runWithExponentialBackoff(WorkflowExecutorContext.empty(), action, constants, requestFunction)

        expect(output.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(requestFunction).toHaveBeenCalledTimes(4)
        expect(output.reliabilityEvents.map((event) => event.kind)).toEqual(Array(3).fill(ReliabilityEventKind.RATE_LIMIT_QUEUED))
    })

    it('does not queue a block that lasts longer than the queue allows', async () => {
        const requestFunction = vi.fn().mockResolvedValue(failedWith(rateLimited(3600)))
        const action = buildCodeAction({ name: 'runtime', input: {} })

        const output = await runWithExponentialBackoff(WorkflowExecutorContext.empty(), action, constants, requestFunction)

        expect(output.verdict.status).toBe(ExecutionStatus.FAILED)
        expect(requestFunction).toHaveBeenCalledTimes(1)
        expect(output.reliabilityEvents).toHaveLength(0)
    })

    it('does not wait while a single step is being tested', async () => {
        const requestFunction = vi.fn().mockResolvedValue(failedWith(rateLimited(4)))
        const action = buildCodeAction({ name: 'runtime', input: {} })

        await runWithExponentialBackoff(WorkflowExecutorContext.empty(), action, generateMockEngineConstants({ stepNameToTest: 'runtime' }), requestFunction)

        expect(requestFunction).toHaveBeenCalledTimes(1)
    })

    it('records every retry made by the error strategy', async () => {
        const requestFunction = vi.fn().mockResolvedValueOnce(failedWith('HTTP 503: unavailable')).mockResolvedValueOnce(failedWith('HTTP 503: unavailable')).mockResolvedValueOnce(succeeded())
        const action = buildCodeAction({
            name: 'runtime',
            input: {},
            errorHandlingOptions: { strategy: { mode: ErrorStrategyMode.RETRY_THEN_STOP, retryAttempts: 3, retryIntervalSeconds: 5 } },
        })

        const output = await runWithExponentialBackoff(WorkflowExecutorContext.empty(), action, constants, requestFunction)

        expect(output.verdict.status).toBe(ExecutionStatus.SUCCEEDED)
        expect(output.reliabilityEvents.map((event) => event.kind)).toEqual([ReliabilityEventKind.AUTO_RETRY, ReliabilityEventKind.AUTO_RETRY])
        expect(output.reliabilityEvents[0]).toMatchObject({ errorCode: 'HTTP_503', waitSeconds: 5 })
        expect(new Set(output.reliabilityEvents.map((event) => event.eventKey)).size).toBe(2)
    })

    it('keeps the events of earlier steps when a later step records its own', async () => {
        const limitedOnce = () => {
            const calls = { count: 0 }
            return vi.fn().mockImplementation(async ({ executionState }: { executionState: WorkflowExecutorContext }) => {
                calls.count += 1
                return executionState.setVerdict(calls.count === 1
                    ? { status: ExecutionStatus.FAILED, failedStep: { name: 'runtime', displayName: 'runtime', message: rateLimited(2) } }
                    : { status: ExecutionStatus.RUNNING })
            })
        }

        const first = await runWithExponentialBackoff(WorkflowExecutorContext.empty(), buildCodeAction({ name: 'one', input: {} }), constants, limitedOnce())
        const second = await runWithExponentialBackoff(first, buildCodeAction({ name: 'two', input: {} }), constants, limitedOnce())

        expect(second.reliabilityEvents.map((event) => event.stepName)).toEqual(['one', 'two'])
    })
})
