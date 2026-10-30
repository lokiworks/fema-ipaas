import { describe, expect, it } from 'vitest'
import { runMonitorUtils } from '../../../../src/app/run-monitor/run-monitor-utils'

describe('health day buckets', () => {
    it('starts each day at local midnight of the requested time zone', () => {
        const starts = runMonitorUtils.dayStarts({ count: 2, now: Date.parse('2026-10-29T20:00:00Z'), timezone: 'Asia/Shanghai' })
        expect(starts.map((start) => new Date(start).toISOString())).toEqual(['2026-10-28T16:00:00.000Z', '2026-10-29T16:00:00.000Z'])
    })

    it('falls back to UTC for an unknown time zone', () => {
        const timezone = runMonitorUtils.safeTimezone('Not/AZone')
        const starts = runMonitorUtils.dayStarts({ count: 1, now: Date.parse('2026-10-29T20:00:00Z'), timezone })
        expect(timezone).toBe('UTC')
        expect(new Date(starts[0]).toISOString()).toBe('2026-10-29T00:00:00.000Z')
    })
})
