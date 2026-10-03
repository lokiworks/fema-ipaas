import { isNil } from './utils'

export const blockedUntilMarker = {
    attach,
    parse,
    strip,
}

function attach({ message, until }: AttachParams): string {
    return `${strip(message)}\n${MARKER_PREFIX}${until.toISOString()}${MARKER_SUFFIX}`
}

function parse(message: string | null | undefined): Date | null {
    if (isNil(message)) {
        return null
    }
    const matches = [...message.matchAll(MARKER_PATTERN)]
    const last = matches.at(-1)
    if (isNil(last)) {
        return null
    }
    const until = new Date(last[1])
    return Number.isNaN(until.getTime()) ? null : until
}

function strip(message: string): string {
    return message.replace(MARKER_STRIP_PATTERN, '').trimEnd()
}

const MARKER_PREFIX = '[blocked-until='
const MARKER_SUFFIX = ']'
const MARKER_PATTERN = /\[blocked-until=([^\]\s]+)\]/g
const MARKER_STRIP_PATTERN = /\n?\[blocked-until=[^\]\s]+\]/g

type AttachParams = {
    message: string
    until: Date
}
