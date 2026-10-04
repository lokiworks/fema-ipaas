import { blockedUntilMarker } from '@fema-ipaas/core-utils'
import { RATE_LIMIT_QUEUE, ReliabilityEventKind, reliabilityUtils } from '../../src'

describe('reliabilityUtils.rateLimitWaitMs', () => {
    const now = new Date('2026-10-04T10:00:00Z').getTime()
    const limited = (seconds: number) => blockedUntilMarker.attach({ message: 'HTTP 429: too fast', until: new Date(now + seconds * 1000) })

    it('waits for the time the other system asked for when it is short', () => {
        expect(reliabilityUtils.rateLimitWaitMs({ message: limited(5), now })).toBe(5_000)
    })

    it('waits at least a second when the block already ended', () => {
        expect(reliabilityUtils.rateLimitWaitMs({ message: limited(-10), now })).toBe(1_000)
    })

    it('does not queue when the other system blocks for longer than the queue allows', () => {
        expect(reliabilityUtils.rateLimitWaitMs({ message: limited(RATE_LIMIT_QUEUE.maxWaitMs / 1000 + 1), now })).toBeNull()
    })

    it('does not queue a rate limit that came without a wait hint', () => {
        expect(reliabilityUtils.rateLimitWaitMs({ message: 'HTTP 429: too fast', now })).toBeNull()
        expect(reliabilityUtils.rateLimitWaitMs({ message: undefined, now })).toBeNull()
    })
})

describe('reliabilityUtils.eventKey', () => {
    it('separates the same step in different loop iterations and attempts', () => {
        const base = { executionId: 'run1', stepName: 'send', kind: ReliabilityEventKind.AUTO_RETRY, sequence: 1 }
        const first = reliabilityUtils.eventKey({ ...base, path: [['loop', 0]] })
        const second = reliabilityUtils.eventKey({ ...base, path: [['loop', 1]] })
        const next = reliabilityUtils.eventKey({ ...base, path: [['loop', 0]], sequence: 2 })
        expect(new Set([first, second, next]).size).toBe(3)
    })
})
