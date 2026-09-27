import { isNil } from '@fema-ipaas/core-utils'

function positiveInteger(raw: string | undefined): number | null {
    if (isNil(raw)) {
        return null
    }
    const trimmed = raw.trim().replace(/[,_]/g, '')
    if (!/^\d+$/.test(trimmed)) {
        return null
    }
    const value = Number(trimmed)
    return Number.isSafeInteger(value) && value > 0 ? value : null
}

function durationSeconds(raw: string | undefined): number | null {
    if (isNil(raw)) {
        return null
    }
    const match = /^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d)?$/i.exec(raw.trim())
    if (isNil(match)) {
        return null
    }
    const unit = (match[2] ?? 's').toLowerCase()
    const seconds = Math.round(Number(match[1]) * (DURATION_MULTIPLIERS[unit] ?? 1))
    return seconds > 0 ? seconds : null
}

function sizeMegabytes(raw: string | undefined): number | null {
    if (isNil(raw)) {
        return null
    }
    const match = /^(\d+(?:\.\d+)?)\s*(kb|k|mb|m|gb|g)?$/i.exec(raw.trim())
    if (isNil(match)) {
        return null
    }
    const unit = (match[2] ?? 'mb').toLowerCase()
    const megabytes = Number(match[1]) * (SIZE_MULTIPLIERS[unit] ?? 1)
    return megabytes > 0 ? megabytes : null
}

export const limitValueParsers = { positiveInteger, durationSeconds, sizeMegabytes }

const DURATION_MULTIPLIERS: Record<string, number> = {
    s: 1,
    sec: 1,
    m: 60,
    min: 60,
    h: 3600,
    hr: 3600,
    d: 86400,
}

const SIZE_MULTIPLIERS: Record<string, number> = {
    kb: 1 / 1024,
    k: 1 / 1024,
    mb: 1,
    m: 1,
    gb: 1024,
    g: 1024,
}
