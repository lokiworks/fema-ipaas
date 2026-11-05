import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { federationRecheckUtils } from '../../../../src/app/federation/federation-session-recheck.service'

describe('federation session recheck schedule', () => {
    const now = dayjs('2026-11-05T12:00:00Z')

    it('is due when the account was never checked', () => {
        expect(federationRecheckUtils.isDue({ lastVerifiedAt: null, minutes: 15, now })).toBe(true)
    })

    it('is not due before the interval has passed', () => {
        expect(federationRecheckUtils.isDue({ lastVerifiedAt: '2026-11-05T11:50:00Z', minutes: 15, now })).toBe(false)
    })

    it('is due once the interval has passed', () => {
        expect(federationRecheckUtils.isDue({ lastVerifiedAt: '2026-11-05T11:45:00Z', minutes: 15, now })).toBe(true)
        expect(federationRecheckUtils.isDue({ lastVerifiedAt: '2026-11-05T11:00:00Z', minutes: 15, now })).toBe(true)
    })

    it('follows a longer configured interval', () => {
        expect(federationRecheckUtils.isDue({ lastVerifiedAt: '2026-11-05T11:00:00Z', minutes: 120, now })).toBe(false)
    })

    it('accepts a Date value', () => {
        expect(federationRecheckUtils.isDue({ lastVerifiedAt: new Date('2026-11-05T11:00:00Z'), minutes: 15, now })).toBe(true)
    })
})
