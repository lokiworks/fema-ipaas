import { describe, expect, it } from 'vitest'
import { SendWorkflowResponseRequest } from '../../../src/lib/engine/requests'

describe('SendWorkflowResponseRequest.runResponse coercion', () => {
    const base = { workerHandlerId: 'w1', httpRequestId: 'r1' }

    it('coerces a string status to a number (return_response stores "200")', () => {
        const parsed = SendWorkflowResponseRequest.parse({
            ...base,
            runResponse: { status: '200', body: { ok: true }, headers: {} },
        })
        expect(parsed.runResponse.status).toBe(200)
    })

    it('coerces non-string header values to strings', () => {
        const parsed = SendWorkflowResponseRequest.parse({
            ...base,
            runResponse: { status: 200, body: '', headers: { 'x-count': 5 } },
        })
        expect(parsed.runResponse.headers['x-count']).toBe('5')
    })

    it('still rejects a non-numeric status', () => {
        expect(() => SendWorkflowResponseRequest.parse({
            ...base,
            runResponse: { status: 'not-a-number', body: '', headers: {} },
        })).toThrow()
    })
})
