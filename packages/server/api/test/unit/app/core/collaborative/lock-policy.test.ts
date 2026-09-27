import { describe, expect, it } from 'vitest'
import { EDIT_LOCK_VALIDITY_MS, LockDecisionKind, lockPolicy } from '../../../../../src/app/core/collaborative/lock/lock-policy'

const NOW = Date.parse('2026-05-02T12:00:00.000Z')
const holder = { userId: 'a', userDisplayName: 'Alice', lastActiveAt: new Date(NOW - 60_000).toISOString() }

describe('lockPolicy.decide', () => {
    it('acquires a free lock and renews your own', () => {
        expect(lockPolicy.decide({ existing: null, userId: 'b', force: false, now: NOW }).kind).toBe(LockDecisionKind.ACQUIRE)
        expect(lockPolicy.decide({ existing: holder, userId: 'a', force: false, now: NOW }).kind).toBe(LockDecisionKind.RENEW)
    })

    it('denies others while the lock is valid and allows a take-over when forced', () => {
        expect(lockPolicy.decide({ existing: holder, userId: 'b', force: false, now: NOW }).kind).toBe(LockDecisionKind.DENY)
        expect(lockPolicy.decide({ existing: holder, userId: 'b', force: true, now: NOW })).toEqual({ kind: LockDecisionKind.TAKE_OVER, previousUserId: 'a' })
    })

    it('treats a lock idle for more than two hours as expired', () => {
        const idle = { ...holder, lastActiveAt: new Date(NOW - EDIT_LOCK_VALIDITY_MS - 1).toISOString() }
        expect(lockPolicy.decide({ existing: idle, userId: 'b', force: false, now: NOW })).toEqual({ kind: LockDecisionKind.ACQUIRE, previousUserId: 'a' })
    })

    it('keeps locks written without activity time valid', () => {
        const legacy = { userId: 'a', userDisplayName: 'Alice' }
        expect(lockPolicy.decide({ existing: legacy, userId: 'b', force: false, now: NOW }).kind).toBe(LockDecisionKind.DENY)
    })
})

describe('lockPolicy.nextValue', () => {
    it('only refreshes the activity time on real activity', () => {
        const renew = { kind: LockDecisionKind.RENEW }
        expect(lockPolicy.nextValue({ existing: holder, decision: renew, userId: 'a', userDisplayName: 'Alice', active: false, now: NOW }).lastActiveAt).toBe(holder.lastActiveAt)
        expect(lockPolicy.nextValue({ existing: holder, decision: renew, userId: 'a', userDisplayName: 'Alice', active: true, now: NOW }).lastActiveAt).toBe(new Date(NOW).toISOString())
    })

    it('reports when a lock expires', () => {
        expect(lockPolicy.expiresAt(holder)).toBe(new Date(NOW - 60_000 + EDIT_LOCK_VALIDITY_MS).toISOString())
    })
})
