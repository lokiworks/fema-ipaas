import { isNil } from '@fema-ipaas/core-utils'

export const scheduleUtils = {
    isScheduleConnector,
    scheduleOf,
    validateCron,
    nextFireTimes,
    localDateOf,
    isValidDate,
}

function isScheduleConnector(connectorName: string | undefined): boolean {
    return connectorName === SCHEDULE_CONNECTOR_NAME
}

function scheduleOf({ triggerName, input }: { triggerName: string | undefined, input: Record<string, unknown> }): ScheduleDefinition | null {
    const timezone = typeof input['timezone'] === 'string' && input['timezone'].length > 0 ? input['timezone'] : 'UTC'
    switch (triggerName) {
        case 'every_x_minutes': {
            const minutes = Number(input['minutes'])
            return Number.isInteger(minutes) && minutes > 0 ? { kind: 'interval', intervalMinutes: minutes, timezone: 'UTC' } : null
        }
        case 'every_hour':
            return { kind: 'cron', cron: input['run_on_weekends'] === true ? '0 * * * *' : '0 * * * 1-5', timezone: 'UTC' }
        case 'every_day': {
            const hour = clampInt({ value: input['hour_of_the_day'], min: 0, max: 23 })
            return { kind: 'cron', cron: input['run_on_weekends'] === true ? `0 ${hour} * * *` : `0 ${hour} * * 1-5`, timezone }
        }
        case 'every_week': {
            const hour = clampInt({ value: input['hour_of_the_day'], min: 0, max: 23 })
            const day = clampInt({ value: input['day_of_the_week'], min: 0, max: 6 })
            return { kind: 'cron', cron: `0 ${hour} * * ${day}`, timezone }
        }
        case 'every_month': {
            const hour = clampInt({ value: input['hour_of_the_day'], min: 0, max: 23 })
            const day = clampInt({ value: input['day_of_the_month'], min: 0, max: 31 })
            return { kind: 'cron', cron: `0 ${hour} ${day} * *`, timezone }
        }
        case 'cron_expression': {
            const cron = typeof input['cronExpression'] === 'string' ? input['cronExpression'].trim() : ''
            return { kind: 'cron', cron, timezone }
        }
        default:
            return null
    }
}

function validateCron(expression: string): boolean {
    return !isNil(parseCron(expression))
}

function nextFireTimes({ schedule, from, count, excludeDates }: NextFireTimesParams): Date[] {
    const excluded = new Set(excludeDates ?? [])
    if (schedule.kind === 'interval') {
        return Array.from({ length: count * 4 }, (_, index) => new Date(from.getTime() + (index + 1) * schedule.intervalMinutes * 60_000))
            .filter((date) => !excluded.has(localDateOf({ instant: date, timezone: schedule.timezone })))
            .slice(0, count)
    }
    const parsed = parseCron(schedule.cron)
    if (isNil(parsed)) {
        return []
    }
    const timezone = safeTimezone(schedule.timezone)
    const start = localPartsOf({ instant: from, timezone })
    const results: Date[] = []
    for (let offset = 0; offset < MAX_LOOKAHEAD_DAYS && results.length < count; offset++) {
        const day = new Date(Date.UTC(start.year, start.month - 1, start.day + offset))
        const year = day.getUTCFullYear()
        const month = day.getUTCMonth() + 1
        const dayOfMonth = day.getUTCDate()
        const dateKey = formatDate({ year, month, day: dayOfMonth })
        if (excluded.has(dateKey) || !dayMatches({ parsed, month, dayOfMonth, dayOfWeek: day.getUTCDay() })) {
            continue
        }
        for (const hour of parsed.hours) {
            for (const minute of parsed.minutes) {
                const instant = zonedTimeToInstant({ year, month, day: dayOfMonth, hour, minute, timezone })
                if (instant > from.getTime() && results.length < count) {
                    results.push(new Date(instant))
                }
            }
        }
    }
    return results
}

function localDateOf({ instant, timezone }: { instant: Date, timezone: string }): string {
    const parts = localPartsOf({ instant, timezone: safeTimezone(timezone) })
    return formatDate(parts)
}

function isValidDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (isNil(match)) {
        return false
    }
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    return formatDate({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }) === value
}

function parseCron(expression: string): ParsedCron | null {
    const fields = expression.trim().split(/\s+/)
    if (fields.length !== 5) {
        return null
    }
    const minutes = parseField({ field: fields[0], min: 0, max: 59, names: {} })
    const hours = parseField({ field: fields[1], min: 0, max: 23, names: {} })
    const daysOfMonth = parseField({ field: fields[2], min: 1, max: 31, names: {} })
    const months = parseField({ field: fields[3], min: 1, max: 12, names: MONTH_NAMES })
    const daysOfWeekRaw = parseField({ field: fields[4], min: 0, max: 7, names: DAY_NAMES })
    if (isNil(minutes) || isNil(hours) || isNil(daysOfMonth) || isNil(months) || isNil(daysOfWeekRaw)) {
        return null
    }
    const daysOfWeek = [...new Set(daysOfWeekRaw.map((day) => (day === 7 ? 0 : day)))].sort((a, b) => a - b)
    return {
        minutes,
        hours,
        daysOfMonth,
        months,
        daysOfWeek,
        dayOfMonthRestricted: !isWildcard(fields[2]),
        dayOfWeekRestricted: !isWildcard(fields[4]),
    }
}

function parseField({ field, min, max, names }: { field: string, min: number, max: number, names: Record<string, number> }): number[] | null {
    const values = new Set<number>()
    for (const part of field.split(',')) {
        const range = parsePart({ part: part.toUpperCase(), min, max, names })
        if (isNil(range)) {
            return null
        }
        range.forEach((value) => values.add(value))
    }
    return values.size === 0 ? null : [...values].sort((a, b) => a - b)
}

function parsePart({ part, min, max, names }: { part: string, min: number, max: number, names: Record<string, number> }): number[] | null {
    const [rangePart, stepPart, ...rest] = part.split('/')
    if (rest.length > 0 || rangePart.length === 0) {
        return null
    }
    const step = isNil(stepPart) ? 1 : parseNumber({ raw: stepPart, names: {} })
    if (isNil(step) || step < 1) {
        return null
    }
    const bounds = rangeBounds({ rangePart, hasStep: !isNil(stepPart), min, max, names })
    if (isNil(bounds) || bounds.start < min || bounds.end > max || bounds.start > bounds.end) {
        return null
    }
    const values: number[] = []
    for (let value = bounds.start; value <= bounds.end; value += step) {
        values.push(value)
    }
    return values
}

function rangeBounds({ rangePart, hasStep, min, max, names }: { rangePart: string, hasStep: boolean, min: number, max: number, names: Record<string, number> }): { start: number, end: number } | null {
    if (rangePart === '*' || rangePart === '?') {
        return { start: min, end: max }
    }
    const [startRaw, endRaw, ...extra] = rangePart.split('-')
    if (extra.length > 0) {
        return null
    }
    const start = parseNumber({ raw: startRaw, names })
    if (isNil(start)) {
        return null
    }
    if (isNil(endRaw)) {
        return { start, end: hasStep ? max : start }
    }
    const end = parseNumber({ raw: endRaw, names })
    return isNil(end) ? null : { start, end }
}

function parseNumber({ raw, names }: { raw: string, names: Record<string, number> }): number | null {
    if (/^\d+$/.test(raw)) {
        return Number(raw)
    }
    const named = names[raw]
    return isNil(named) ? null : named
}

function isWildcard(field: string): boolean {
    return field === '*' || field === '?'
}

function dayMatches({ parsed, month, dayOfMonth, dayOfWeek }: { parsed: ParsedCron, month: number, dayOfMonth: number, dayOfWeek: number }): boolean {
    if (!parsed.months.includes(month)) {
        return false
    }
    const domMatch = parsed.daysOfMonth.includes(dayOfMonth)
    const dowMatch = parsed.daysOfWeek.includes(dayOfWeek)
    if (parsed.dayOfMonthRestricted && parsed.dayOfWeekRestricted) {
        return domMatch || dowMatch
    }
    return domMatch && dowMatch
}

function zonedTimeToInstant({ year, month, day, hour, minute, timezone }: ZonedTime): number {
    const guess = Date.UTC(year, month - 1, day, hour, minute)
    const firstOffset = offsetMinutes({ instant: guess, timezone })
    const candidate = guess - firstOffset * 60_000
    const secondOffset = offsetMinutes({ instant: candidate, timezone })
    return secondOffset === firstOffset ? candidate : guess - secondOffset * 60_000
}

function offsetMinutes({ instant, timezone }: { instant: number, timezone: string }): number {
    const parts = localPartsOf({ instant: new Date(instant), timezone })
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    return Math.round((asUtc - Math.floor(instant / 60_000) * 60_000) / 60_000)
}

function localPartsOf({ instant, timezone }: { instant: Date, timezone: string }): LocalParts {
    const formatted = formatterFor(timezone).formatToParts(instant)
    const read = (type: Intl.DateTimeFormatPartTypes): number => Number(formatted.find((part) => part.type === type)?.value ?? 0)
    return {
        year: read('year'),
        month: read('month'),
        day: read('day'),
        hour: read('hour') % 24,
        minute: read('minute'),
    }
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
    const cached = formatters.get(timezone)
    if (!isNil(cached)) {
        return cached
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
    formatters.set(timezone, formatter)
    return formatter
}

function safeTimezone(timezone: string): string {
    try {
        formatterFor(timezone)
        return timezone
    }
    catch {
        return 'UTC'
    }
}

function formatDate({ year, month, day }: { year: number, month: number, day: number }): string {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function clampInt({ value, min, max }: { value: unknown, min: number, max: number }): number {
    const numeric = Number(value)
    if (!Number.isInteger(numeric)) {
        return min
    }
    return Math.min(Math.max(numeric, min), max)
}

const formatters = new Map<string, Intl.DateTimeFormat>()
const MAX_LOOKAHEAD_DAYS = 366 * 2
const MONTH_NAMES: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 }
const DAY_NAMES: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }

type ParsedCron = {
    minutes: number[]
    hours: number[]
    daysOfMonth: number[]
    months: number[]
    daysOfWeek: number[]
    dayOfMonthRestricted: boolean
    dayOfWeekRestricted: boolean
}

type LocalParts = {
    year: number
    month: number
    day: number
    hour: number
    minute: number
}

type ZonedTime = LocalParts & {
    timezone: string
}

type NextFireTimesParams = {
    schedule: ScheduleDefinition
    from: Date
    count: number
    excludeDates?: string[]
}

export type ScheduleDefinition =
    | { kind: 'cron', cron: string, timezone: string }
    | { kind: 'interval', intervalMinutes: number, timezone: string }

export const SCHEDULE_CONNECTOR_NAME = '@fema-ipaas/connector-schedule'
