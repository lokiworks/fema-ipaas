import { beforeEach, describe, expect, it } from 'vitest'
import { lastActiveTracker } from '../../../../src/app/user/last-active-tracker'

describe('lastActiveTracker', () => {
    beforeEach(() => {
        lastActiveTracker.reset()
    })

    it('writes the first time a user is seen', () => {
        expect(lastActiveTracker.shouldWrite({ userId: 'u1', now: 1_000 })).toBe(true)
    })

    it('skips repeated requests inside the interval', () => {
        lastActiveTracker.shouldWrite({ userId: 'u1', now: 1_000 })
        expect(lastActiveTracker.shouldWrite({ userId: 'u1', now: 1_000 + 60_000 })).toBe(false)
    })

    it('writes again once the interval has passed', () => {
        lastActiveTracker.shouldWrite({ userId: 'u1', now: 1_000 })
        expect(lastActiveTracker.shouldWrite({ userId: 'u1', now: 1_000 + 5 * 60 * 1000 })).toBe(true)
    })

    it('throttles each user independently', () => {
        lastActiveTracker.shouldWrite({ userId: 'u1', now: 1_000 })
        expect(lastActiveTracker.shouldWrite({ userId: 'u2', now: 2_000 })).toBe(true)
    })
})
