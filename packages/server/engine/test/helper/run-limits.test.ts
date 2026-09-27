import { ExecutionError } from '@fema-ipaas/shared'
import { runLimits } from '../../src/lib/helper/run-limits'

describe('runLimits', () => {
    const saved = { ...process.env }

    afterEach(() => {
        process.env = { ...saved }
    })

    it('treats unset or invalid limits as not configured', () => {
        delete process.env.FEMA_MAX_NODES_PER_RUN
        delete process.env.FEMA_STEP_TIMEOUT_SECONDS
        process.env.FEMA_MAX_STEP_PAYLOAD_MB = 'abc'
        expect(runLimits.maxNodesPerRun()).toBeNull()
        expect(runLimits.stepTimeoutMs()).toBeNull()
        expect(runLimits.maxStepPayloadBytes()).toBeNull()
    })

    it('reads the limits propagated by the worker', () => {
        process.env.FEMA_MAX_NODES_PER_RUN = '40000'
        process.env.FEMA_STEP_TIMEOUT_SECONDS = '600'
        process.env.FEMA_MAX_STEP_PAYLOAD_MB = '4'
        expect(runLimits.maxNodesPerRun()).toBe(40000)
        expect(runLimits.stepTimeoutMs()).toBe(600000)
        expect(runLimits.maxStepPayloadBytes()).toBe(4 * 1024 * 1024)
    })

    it('flags only counts above the limit', () => {
        expect(runLimits.exceedsNodeLimit({ stepsCount: 40000, limit: 40000 })).toBe(false)
        expect(runLimits.exceedsNodeLimit({ stepsCount: 40001, limit: 40000 })).toBe(true)
        expect(runLimits.exceedsNodeLimit({ stepsCount: 10 ** 9, limit: null })).toBe(false)
        expect(runLimits.exceedsPayloadLimit({ bytes: 10, limit: 9 })).toBe(true)
        expect(runLimits.exceedsPayloadLimit({ bytes: 10, limit: null })).toBe(false)
    })

    it('fails a step whose input and output exceed the payload limit', () => {
        process.env.FEMA_MAX_STEP_PAYLOAD_MB = '0.001'
        expect(() => runLimits.assertStepPayloadWithinLimit({ input: { a: 1 }, output: 'x'.repeat(4096) })).toThrow(ExecutionError)
        expect(() => runLimits.assertStepPayloadWithinLimit({ input: { a: 1 }, output: 'ok' })).not.toThrow()
    })

    it('does not check payloads when no limit is configured', () => {
        delete process.env.FEMA_MAX_STEP_PAYLOAD_MB
        expect(() => runLimits.assertStepPayloadWithinLimit({ input: {}, output: 'x'.repeat(10 ** 6) })).not.toThrow()
    })

    it('builds a user-facing timeout error', () => {
        const error = runLimits.stepTimeoutError(600000)
        expect(error).toBeInstanceOf(ExecutionError)
        expect(error.message).toContain('600 seconds')
    })
})
