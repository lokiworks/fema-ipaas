import { EngineResponseStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { actionRunOutcome } from '../../src/app/action-run/action-run.service'

describe('actionRunOutcome.toOutcome', () => {
    it('unwraps the connector error envelope so callers get the plain message without the stack', () => {
        const message = JSON.stringify({ __apErrorVersion: 1, message: 'Ticket queue is full (E_QUEUE)', raw: 'Error: x\n    at IAction.<anonymous> (/srv/app/file.js:1:1)' })

        const outcome = actionRunOutcome.toOutcome({
            response: { status: EngineResponseStatus.OK, response: { success: false, input: {}, output: null, message } },
            durationMs: 5,
        })

        expect(outcome.errorMessage).toBe('Ticket queue is full (E_QUEUE)')
    })

    it('keeps a plain error message as it is', () => {
        const outcome = actionRunOutcome.toOutcome({
            response: { status: EngineResponseStatus.OK, response: { success: false, input: {}, output: null, message: 'plain failure' } },
            durationMs: 5,
        })

        expect(outcome.errorMessage).toBe('plain failure')
    })
})
