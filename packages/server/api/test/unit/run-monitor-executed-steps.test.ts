import { ExecutionStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { runMonitorUtils } from '../../src/app/run-monitor/run-monitor-utils'

describe('runMonitorUtils.executedStepsOf', () => {
    it('adds the step a failed run stopped at to the steps it completed', () => {
        const total = runMonitorUtils.executedStepsOf([
            { status: ExecutionStatus.SUCCEEDED, count: 2, steps: 6 },
            { status: ExecutionStatus.FAILED, count: 3, steps: 3 },
        ])
        expect(total).toBe(12)
    })

    it('counts a run stopped by a timeout or the memory limit as stopped at a step', () => {
        const total = runMonitorUtils.executedStepsOf([
            { status: ExecutionStatus.TIMEOUT, count: 1, steps: 2 },
            { status: ExecutionStatus.MEMORY_LIMIT_EXCEEDED, count: 2, steps: 0 },
        ])
        expect(total).toBe(5)
    })

    it('adds nothing for runs that did not stop at a step', () => {
        const total = runMonitorUtils.executedStepsOf([
            { status: ExecutionStatus.CANCELED, count: 4, steps: 8 },
            { status: ExecutionStatus.RUNNING, count: 1, steps: 1 },
            { status: ExecutionStatus.INTERNAL_ERROR, count: 5, steps: 0 },
            { status: ExecutionStatus.SUCCEEDED, count: 1, steps: 3 },
        ])
        expect(total).toBe(12)
    })

    it('is zero without runs', () => {
        expect(runMonitorUtils.executedStepsOf([])).toBe(0)
    })
})
