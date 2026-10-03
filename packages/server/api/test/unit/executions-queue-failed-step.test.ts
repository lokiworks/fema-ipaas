import { ExecutionStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { executionsQueueUtils } from '../../src/app/workflows/execution/executions-queue'

const failedStep = { name: 'step_1', displayName: 'Step 1', message: 'boom' }

describe('executionsQueueUtils.failedStepUpdate', () => {
    it('clears the failed step of a run that ends up succeeded, for example after a resume in place', () => {
        const update = executionsQueueUtils.failedStepUpdate({ status: ExecutionStatus.SUCCEEDED, failedStep: undefined })
        expect(typeof update.failedStep === 'function' ? update.failedStep() : update.failedStep).toBe('NULL')
    })

    it('keeps writing the failed step of a run that failed', () => {
        expect(executionsQueueUtils.failedStepUpdate({ status: ExecutionStatus.FAILED, failedStep })).toEqual({ failedStep })
    })

    it('leaves the failed step alone while a run is still going', () => {
        expect(executionsQueueUtils.failedStepUpdate({ status: ExecutionStatus.RUNNING, failedStep: undefined })).toEqual({})
        expect(executionsQueueUtils.failedStepUpdate({ status: undefined, failedStep: undefined })).toEqual({})
    })
})
