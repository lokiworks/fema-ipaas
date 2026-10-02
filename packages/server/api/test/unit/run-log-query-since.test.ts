import { RunLogTimeRange } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { runLogQuery } from '../../src/app/run-logs/run-log-query'

describe('runLogQuery.sinceOf', () => {
    const now = new Date('2026-10-02T10:00:00.000Z')

    it('keeps short ranges rolling', () => {
        expect(runLogQuery.sinceOf({ query: { time: RunLogTimeRange.HOURS_24 }, now })).toBe('2026-10-01T10:00:00.000Z')
    })

    it('turns day ranges into calendar days in the caller timezone', () => {
        expect(runLogQuery.sinceOf({ query: { time: RunLogTimeRange.DAYS_7, timezone: 'Asia/Shanghai' }, now })).toBe('2026-09-25T16:00:00.000Z')
        expect(runLogQuery.sinceOf({ query: { time: RunLogTimeRange.DAYS_7 }, now })).toBe('2026-09-26T00:00:00.000Z')
    })

    it('prefers an explicit createdAfter', () => {
        expect(runLogQuery.sinceOf({ query: { time: RunLogTimeRange.DAYS_7, createdAfter: '2026-09-01T00:00:00.000Z' }, now })).toBe('2026-09-01T00:00:00.000Z')
    })
})
