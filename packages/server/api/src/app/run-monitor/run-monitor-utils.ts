import { isNil } from '@fema-ipaas/core-utils'
import {
    AiFeature,
    ExecutionStatus,
    RunEnvironment,
    RunMonitorAiSource,
    RunMonitorBucket,
    RunMonitorBucketUnit,
    RunMonitorRange,
    RunMonitorStatusGroup,
} from '@fema-ipaas/shared'

function safeTimezone(timezone: string | undefined): string {
    if (isNil(timezone) || timezone.trim().length === 0) {
        return DEFAULT_TIMEZONE
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone })
        return timezone
    }
    catch {
        return DEFAULT_TIMEZONE
    }
}

function rangeSpec(range: RunMonitorRange): RangeSpec {
    return RANGE_SPECS[range]
}

function wallClock({ instant, timezone }: { instant: number, timezone: string }): WallClock {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(instant))
    const valueOf = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value ?? '0')
    return {
        year: valueOf('year'),
        month: valueOf('month'),
        day: valueOf('day'),
        hour: valueOf('hour') % 24,
        minute: valueOf('minute'),
        second: valueOf('second'),
    }
}

function instantOf({ wall, timezone }: { wall: WallClock, timezone: string }): number {
    const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
    const first = guess - offsetAt({ instant: guess, timezone })
    return guess - offsetAt({ instant: first, timezone })
}

function bucketStarts({ range, now, timezone }: { range: RunMonitorRange, now: number, timezone: string }): number[] {
    const spec = rangeSpec(range)
    const wall = wallClock({ instant: now, timezone })
    if (spec.unit === RunMonitorBucketUnit.DAY) {
        return Array.from({ length: spec.count }, (_, index) => {
            const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day - (spec.count - 1 - index)))
            return instantOf({
                wall: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 0, minute: 0, second: 0 },
                timezone,
            })
        })
    }
    const aligned = spec.unit === RunMonitorBucketUnit.HOUR
        ? { ...wall, minute: 0, second: 0 }
        : { ...wall, minute: Math.floor(wall.minute / spec.step) * spec.step, second: 0 }
    const last = Math.min(instantOf({ wall: aligned, timezone }), now)
    const stepMs = spec.step * (spec.unit === RunMonitorBucketUnit.HOUR ? HOUR_MS : MINUTE_MS)
    return Array.from({ length: spec.count }, (_, index) => last - (spec.count - 1 - index) * stepMs)
}

function timeWindow({ range, now, timezone }: { range: RunMonitorRange, now: number, timezone: string }): MonitorWindow {
    const starts = bucketStarts({ range, now, timezone })
    const from = starts[0]
    return { starts, from, to: now, previousFrom: from - (now - from) }
}

function statusGroup(status: ExecutionStatus): RunMonitorStatusGroup {
    if (status === ExecutionStatus.SUCCEEDED) {
        return RunMonitorStatusGroup.SUCCEEDED
    }
    if (status === ExecutionStatus.CANCELED) {
        return RunMonitorStatusGroup.TERMINATED
    }
    if (ACTIVE_STATUSES.includes(status)) {
        return RunMonitorStatusGroup.RUNNING
    }
    return RunMonitorStatusGroup.FAILED
}

function emptyCounts(): GroupCounts {
    return { succeeded: 0, failed: 0, terminated: 0, running: 0 }
}

function addToCounts({ counts, status, count }: { counts: GroupCounts, status: ExecutionStatus, count: number }): GroupCounts {
    const key = GROUP_KEYS[statusGroup(status)]
    return { ...counts, [key]: counts[key] + count }
}

function countsOf(rows: StatusCountRow[]): GroupCounts {
    return rows.reduce((counts, row) => addToCounts({ counts, status: row.status, count: row.count }), emptyCounts())
}

function fillBuckets({ starts, to, rows }: { starts: number[], to: number, rows: BucketStatusRow[] }): RunMonitorBucket[] {
    return starts.map((start, index) => {
        const end = index === starts.length - 1 ? to : starts[index + 1]
        const counts = countsOf(rows.filter((row) => row.bucket === index + 1))
        return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), ...counts }
    })
}

function trendOf({ count, rows }: { count: number, rows: { bucket: number, count: number }[] }): number[] {
    return Array.from({ length: count }, (_, index) =>
        rows.filter((row) => row.bucket === index + 1).reduce((sum, row) => sum + row.count, 0),
    )
}

function aiSource({ feature, environment }: { feature: AiFeature, environment: string | null }): RunMonitorAiSource {
    switch (feature) {
        case AiFeature.COPILOT:
            return RunMonitorAiSource.EDITOR_ASSISTANT
        case AiFeature.AUTO_MAPPING:
            return RunMonitorAiSource.AUTO_MAPPING
        case AiFeature.GENERATE_WORKFLOW:
            return RunMonitorAiSource.GENERATE_WORKFLOW
        case AiFeature.AGENT:
        case AiFeature.ASK_MODEL:
            return environment === RunEnvironment.TESTING ? RunMonitorAiSource.DEBUG_RUN : RunMonitorAiSource.WORKFLOW_RUN
    }
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
    if (isNil(value)) {
        return null
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function offsetAt({ instant, timezone }: { instant: number, timezone: string }): number {
    const floored = Math.floor(instant / 1000) * 1000
    const wall = wallClock({ instant: floored, timezone })
    return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - floored
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DEFAULT_TIMEZONE = 'UTC'

const ACTIVE_STATUSES: ExecutionStatus[] = [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING, ExecutionStatus.PAUSED]

const GROUP_KEYS: Record<RunMonitorStatusGroup, keyof GroupCounts> = {
    [RunMonitorStatusGroup.SUCCEEDED]: 'succeeded',
    [RunMonitorStatusGroup.FAILED]: 'failed',
    [RunMonitorStatusGroup.TERMINATED]: 'terminated',
    [RunMonitorStatusGroup.RUNNING]: 'running',
}

const RANGE_SPECS: Record<RunMonitorRange, RangeSpec> = {
    [RunMonitorRange.LAST_15_MINUTES]: { unit: RunMonitorBucketUnit.MINUTE, step: 1, count: 15 },
    [RunMonitorRange.LAST_HOUR]: { unit: RunMonitorBucketUnit.MINUTE, step: 5, count: 12 },
    [RunMonitorRange.LAST_24_HOURS]: { unit: RunMonitorBucketUnit.HOUR, step: 1, count: 24 },
    [RunMonitorRange.LAST_7_DAYS]: { unit: RunMonitorBucketUnit.DAY, step: 1, count: 7 },
    [RunMonitorRange.LAST_30_DAYS]: { unit: RunMonitorBucketUnit.DAY, step: 1, count: 30 },
}

export const runMonitorUtils = {
    safeTimezone,
    rangeSpec,
    wallClock,
    instantOf,
    bucketStarts,
    timeWindow,
    statusGroup,
    countsOf,
    fillBuckets,
    trendOf,
    aiSource,
    toNumberOrNull,
    activeStatuses: ACTIVE_STATUSES,
}

export type RangeSpec = {
    unit: RunMonitorBucketUnit
    step: number
    count: number
}

export type WallClock = {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
}

export type MonitorWindow = {
    starts: number[]
    from: number
    to: number
    previousFrom: number
}

export type GroupCounts = {
    succeeded: number
    failed: number
    terminated: number
    running: number
}

export type StatusCountRow = {
    status: ExecutionStatus
    count: number
}

export type BucketStatusRow = StatusCountRow & {
    bucket: number
}
