import { ActionReliability, createAction, createConnector } from '@fema-ipaas/connector-sdk'
import { ErrorStrategyMode, ExecutionStatus, GenericStepOutput, ReliabilityEventKind, StepOutputStatus, WorkflowActionType } from '@fema-ipaas/shared'
import { connectorRunner } from '../../src/lib/core/connector/connector-runner'
import { WorkflowExecutorContext } from '../../src/lib/handler/context/workflow-execution-context'
import { errorStrategyTiming, runWithExponentialBackoff } from '../../src/lib/helper/error-handling'
import { buildConnectorAction, generateMockEngineConstants } from '../handler/test-helper'

function describeAction(reliability: ActionReliability) {
    const connector = createConnector({
        displayName: 'Test', logoUrl: '', authors: [], auth: undefined, triggers: [],
        actions: [createAction({ name: 'write', displayName: 'Write', description: '', props: {}, requireAuth: false, classification: 'WRITE', reliability, run: async () => undefined })],
    })
    vi.spyOn(connectorRunner, 'describe').mockResolvedValue({ metadata: { ...connector.metadata(), authors: [], name: 'test', version: '1.0.0' }, functionPaths: [], hasPath: () => true })
}

afterEach(() => vi.restoreAllMocks())

describe('connector retry safety', () => {
    it.each([true, false])('withholds unsafe writes after an ambiguous 500 with legacy=%s', async (legacy) => {
        describeAction({ writeSafety: 'UNSAFE' })
        const action = buildConnectorAction({ name: 'step1', connectorName: 'test', actionName: 'write', input: {}, errorHandlingOptions: legacy ? { retryOnFailure: { value: true } } : { strategy: { mode: ErrorStrategyMode.RETRY_THEN_STOP, attempts: 3, intervalSeconds: 5 } } })
        const state = WorkflowExecutorContext.empty().setVerdict({ status: ExecutionStatus.FAILED, failedStep: { name: 'step1', displayName: 'Write', message: 'HTTP 500: connection lost after write' } })
        const request = vi.fn().mockResolvedValue(state)
        const result = await runWithExponentialBackoff(WorkflowExecutorContext.empty(), action, generateMockEngineConstants(), request)
        expect(request).toHaveBeenCalledTimes(1)
        expect(result.reliabilityEvents).toEqual([expect.objectContaining({ kind: ReliabilityEventKind.RETRY_WITHHELD, reason: 'UNSAFE_OUTCOME_UNKNOWN' })])
    })

    it('retries a message with a real key inside its dedupe window', async () => {
        describeAction({ writeSafety: 'UNSAFE', dedupeKeyProp: 'dedupeKey', dedupeWindowSeconds: 3600 })
        vi.spyOn(errorStrategyTiming, 'sleep').mockResolvedValue()
        const action = buildConnectorAction({ name: 'step1', connectorName: 'test', actionName: 'write', input: {}, errorHandlingOptions: { strategy: { mode: ErrorStrategyMode.RETRY_THEN_STOP, attempts: 1, intervalSeconds: 5 } } })
        const failed = await WorkflowExecutorContext.empty().upsertStep('step1', GenericStepOutput.create({ type: WorkflowActionType.CONNECTOR, input: { dedupeKey: 'employee:event' }, status: StepOutputStatus.FAILED }))
        const request = vi.fn().mockResolvedValueOnce(failed.setVerdict({ status: ExecutionStatus.FAILED, failedStep: { name: 'step1', displayName: 'Write', message: 'HTTP 500' } })).mockResolvedValueOnce(WorkflowExecutorContext.empty())
        await runWithExponentialBackoff(WorkflowExecutorContext.empty(), action, generateMockEngineConstants(), request)
        expect(request).toHaveBeenCalledTimes(2)
    })
})
