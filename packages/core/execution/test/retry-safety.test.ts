import { describe, expect, it } from 'vitest'
import { retrySafety } from '../src/lib/execution/retry-safety'

const defaults = { firstAttemptAt: 1000, now: 2000 }

describe('retrySafety', () => {
    it.each(['READ', 'SEARCH'])('retries %s even after ambiguous failures', (classification) => {
        expect(retrySafety.decide({ ...defaults, classification: classification === 'READ' ? 'READ' : 'SEARCH', errorCode: 'HTTP_500' })).toEqual({ allowed: true, reason: 'READ_ONLY' })
    })
    it.each(['IDEMPOTENT', 'LOOKUP_BEFORE_WRITE'])('retries %s writes', (writeSafety) => {
        expect(retrySafety.decide({ ...defaults, writeSafety: writeSafety === 'IDEMPOTENT' ? 'IDEMPOTENT' : 'LOOKUP_BEFORE_WRITE', errorCode: 'STEP_TIMEOUT' }).allowed).toBe(true)
    })
    it.each([400, 401, 403, 404, 409, 422, 429])('retries a rejected unsafe write with status %s', (status) => {
        expect(retrySafety.decide({ ...defaults, writeSafety: 'UNSAFE', errorCode: `HTTP_${status}` })).toEqual({ allowed: true, reason: 'NOT_APPLIED' })
    })
    it.each(['HTTP_500', 'HTTP_502', 'HTTP_504', 'HTTP_408', 'STEP_TIMEOUT', 'STEP_FAILED'])('withholds an unsafe write with %s', (errorCode) => {
        expect(retrySafety.decide({ ...defaults, writeSafety: 'UNSAFE', errorCode })).toEqual({ allowed: false, reason: 'UNSAFE_OUTCOME_UNKNOWN' })
        expect(retrySafety.decide({ ...defaults, errorCode }).allowed).toBe(false)
    })
    it('expires a bounded idempotency guarantee at the window boundary', () => {
        expect(retrySafety.decide({ ...defaults, writeSafety: 'IDEMPOTENT', dedupeWindowSeconds: 1 })).toEqual({ allowed: false, reason: 'DEDUPE_WINDOW_PASSED' })
        expect(retrySafety.decide({ ...defaults, now: 1999, writeSafety: 'IDEMPOTENT', dedupeWindowSeconds: 1 }).allowed).toBe(true)
    })
    it('allows a vendor rejection marked blocked-until', () => {
        expect(retrySafety.decide({ ...defaults, message: 'limited [blocked-until=2030-01-01T00:00:00Z]' })).toEqual({ allowed: true, reason: 'NOT_APPLIED' })
    })
})
