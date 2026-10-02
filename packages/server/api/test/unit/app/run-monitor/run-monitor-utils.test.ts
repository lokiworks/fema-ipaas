import { AiFeature, ExecutionStatus, RunEnvironment, RunMonitorAiSource, RunMonitorBucketUnit, RunMonitorRange, RunMonitorStatusGroup } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { runMonitorUtils } from '../../../../src/app/run-monitor/run-monitor-utils'

const iso = (instant: number): string => new Date(instant).toISOString()

describe('runMonitorUtils.safeTimezone', () => {
    it('keeps a valid IANA zone', () => {
        expect(runMonitorUtils.safeTimezone('Asia/Shanghai')).toBe('Asia/Shanghai')
    })

    it('falls back to UTC for missing or invalid zones', () => {
        expect(runMonitorUtils.safeTimezone(undefined)).toBe('UTC')
        expect(runMonitorUtils.safeTimezone('Mars/Olympus')).toBe('UTC')
    })
})

describe('runMonitorUtils.bucketStarts', () => {
    const now = Date.parse('2026-09-27T10:37:42.500Z')

    it('uses 1-minute buckets for the last 15 minutes', () => {
        const starts = runMonitorUtils.bucketStarts({ range: RunMonitorRange.LAST_15_MINUTES, now, timezone: 'Asia/Shanghai' })
        expect(starts).toHaveLength(15)
        expect(iso(starts[14])).toBe('2026-09-27T10:37:00.000Z')
        expect(iso(starts[0])).toBe('2026-09-27T10:23:00.000Z')
    })

    it('aligns 5-minute buckets to local wall clock in a 45-minute offset zone', () => {
        const starts = runMonitorUtils.bucketStarts({ range: RunMonitorRange.LAST_HOUR, now, timezone: 'Asia/Kathmandu' })
        expect(starts).toHaveLength(12)
        expect(iso(starts[11])).toBe('2026-09-27T10:35:00.000Z')
        const local = runMonitorUtils.wallClock({ instant: starts[11], timezone: 'Asia/Kathmandu' })
        expect(local.minute % 5).toBe(0)
        expect(starts[11] - starts[10]).toBe(5 * 60 * 1000)
    })

    it('aligns hourly buckets to local hours in a half-hour offset zone', () => {
        const starts = runMonitorUtils.bucketStarts({ range: RunMonitorRange.LAST_24_HOURS, now, timezone: 'Asia/Kolkata' })
        expect(starts).toHaveLength(24)
        expect(iso(starts[23])).toBe('2026-09-27T10:30:00.000Z')
        expect(runMonitorUtils.wallClock({ instant: starts[0], timezone: 'Asia/Kolkata' }).minute).toBe(0)
    })

    it('starts daily buckets at local midnight', () => {
        const starts = runMonitorUtils.bucketStarts({ range: RunMonitorRange.LAST_7_DAYS, now, timezone: 'Asia/Shanghai' })
        expect(starts).toHaveLength(7)
        expect(iso(starts[6])).toBe('2026-09-26T16:00:00.000Z')
        expect(iso(starts[0])).toBe('2026-09-20T16:00:00.000Z')
    })

    it('keeps local midnight across a DST change', () => {
        const dstNow = Date.parse('2026-11-03T12:00:00.000Z')
        const starts = runMonitorUtils.bucketStarts({ range: RunMonitorRange.LAST_7_DAYS, now: dstNow, timezone: 'America/New_York' })
        expect(iso(starts[6])).toBe('2026-11-03T05:00:00.000Z')
        expect(iso(starts[0])).toBe('2026-10-28T04:00:00.000Z')
        starts.forEach((start) => {
            const wall = runMonitorUtils.wallClock({ instant: start, timezone: 'America/New_York' })
            expect([wall.hour, wall.minute]).toEqual([0, 0])
        })
    })

    it('uses 30 daily buckets for 30 days', () => {
        expect(runMonitorUtils.bucketStarts({ range: RunMonitorRange.LAST_30_DAYS, now, timezone: 'UTC' })).toHaveLength(30)
        expect(runMonitorUtils.rangeSpec(RunMonitorRange.LAST_30_DAYS).unit).toBe(RunMonitorBucketUnit.DAY)
    })
})

describe('runMonitorUtils.timeWindow', () => {
    it('measures the previous period with the same length ending at the range start', () => {
        const now = Date.parse('2026-09-27T10:00:00.000Z')
        const result = runMonitorUtils.timeWindow({ range: RunMonitorRange.LAST_24_HOURS, now, timezone: 'UTC' })
        expect(iso(result.from)).toBe('2026-09-26T11:00:00.000Z')
        expect(result.to).toBe(now)
        expect(result.from - result.previousFrom).toBe(now - result.from)
    })
})

describe('runMonitorUtils.statusGroup', () => {
    it('groups every execution status', () => {
        expect(runMonitorUtils.statusGroup(ExecutionStatus.SUCCEEDED)).toBe(RunMonitorStatusGroup.SUCCEEDED)
        expect(runMonitorUtils.statusGroup(ExecutionStatus.CANCELED)).toBe(RunMonitorStatusGroup.TERMINATED)
        expect(runMonitorUtils.statusGroup(ExecutionStatus.PAUSED)).toBe(RunMonitorStatusGroup.RUNNING)
        expect(runMonitorUtils.statusGroup(ExecutionStatus.QUEUED)).toBe(RunMonitorStatusGroup.RUNNING)
        expect(runMonitorUtils.statusGroup(ExecutionStatus.TIMEOUT)).toBe(RunMonitorStatusGroup.FAILED)
        expect(runMonitorUtils.statusGroup(ExecutionStatus.INTERNAL_ERROR)).toBe(RunMonitorStatusGroup.FAILED)
        expect(runMonitorUtils.statusGroup(ExecutionStatus.MEMORY_LIMIT_EXCEEDED)).toBe(RunMonitorStatusGroup.FAILED)
        expect(runMonitorUtils.statusGroup(ExecutionStatus.LOG_SIZE_EXCEEDED)).toBe(RunMonitorStatusGroup.FAILED)
    })
})

describe('runMonitorUtils.fillBuckets', () => {
    it('fills missing buckets with zeros and ends the last bucket at now', () => {
        const starts = [0, 1000, 2000]
        const buckets = runMonitorUtils.fillBuckets({
            starts,
            to: 2500,
            rows: [
                { bucket: 1, status: ExecutionStatus.SUCCEEDED, count: 3 },
                { bucket: 1, status: ExecutionStatus.FAILED, count: 1 },
                { bucket: 1, status: ExecutionStatus.TIMEOUT, count: 2 },
                { bucket: 3, status: ExecutionStatus.RUNNING, count: 4 },
            ],
        })
        expect(buckets.map((bucket) => [bucket.succeeded, bucket.failed, bucket.terminated, bucket.running])).toEqual([[3, 3, 0, 0], [0, 0, 0, 0], [0, 0, 0, 4]])
        expect(buckets[2].end).toBe(iso(2500))
        expect(buckets[0].end).toBe(iso(1000))
    })
})

describe('runMonitorUtils.trendOf', () => {
    it('sums every status per bucket', () => {
        expect(runMonitorUtils.trendOf({ count: 3, rows: [{ bucket: 2, count: 1 }, { bucket: 2, count: 4 }, { bucket: 3, count: 2 }] })).toEqual([0, 5, 2])
    })
})

describe('runMonitorUtils.aiSource', () => {
    it('maps AI features to monitor sources', () => {
        expect(runMonitorUtils.aiSource({ feature: AiFeature.COPILOT, environment: null })).toBe(RunMonitorAiSource.EDITOR_ASSISTANT)
        expect(runMonitorUtils.aiSource({ feature: AiFeature.AUTO_MAPPING, environment: null })).toBe(RunMonitorAiSource.AUTO_MAPPING)
        expect(runMonitorUtils.aiSource({ feature: AiFeature.GENERATE_WORKFLOW, environment: null })).toBe(RunMonitorAiSource.GENERATE_WORKFLOW)
        expect(runMonitorUtils.aiSource({ feature: AiFeature.AGENT, environment: RunEnvironment.PRODUCTION })).toBe(RunMonitorAiSource.WORKFLOW_RUN)
        expect(runMonitorUtils.aiSource({ feature: AiFeature.ASK_MODEL, environment: RunEnvironment.TESTING })).toBe(RunMonitorAiSource.DEBUG_RUN)
        expect(runMonitorUtils.aiSource({ feature: AiFeature.ASK_MODEL, environment: null })).toBe(RunMonitorAiSource.WORKFLOW_RUN)
    })
})

describe('runMonitorUtils calendar windows', () => {
    const now = Date.parse('2026-10-02T10:00:00.000Z')

    it('starts the 7-day window at local midnight six days before today', () => {
        expect(iso(runMonitorUtils.calendarDaysStart({ days: 7, now, timezone: 'Asia/Shanghai' }))).toBe('2026-09-25T16:00:00.000Z')
        expect(iso(runMonitorUtils.calendarDaysStart({ days: 7, now, timezone: 'UTC' }))).toBe('2026-09-26T00:00:00.000Z')
    })

    it('agrees with the first bucket of the monitor 7-day range', () => {
        const [first] = runMonitorUtils.bucketStarts({ range: RunMonitorRange.LAST_7_DAYS, now, timezone: 'Asia/Shanghai' })
        expect(runMonitorUtils.calendarDaysStart({ days: 7, now, timezone: 'Asia/Shanghai' })).toBe(first)
    })

    it('counts today as the only day for a 1-day window', () => {
        expect(iso(runMonitorUtils.calendarDaysStart({ days: 1, now, timezone: 'Asia/Shanghai' }))).toBe('2026-10-01T16:00:00.000Z')
    })

    it('starts the month at local midnight on the first', () => {
        expect(iso(runMonitorUtils.calendarMonthStart({ now, timezone: 'Asia/Shanghai' }))).toBe('2026-09-30T16:00:00.000Z')
        expect(iso(runMonitorUtils.calendarMonthStart({ now, timezone: 'UTC' }))).toBe('2026-10-01T00:00:00.000Z')
    })
})
