import { blockedUntilMarker } from '../src'

describe('blockedUntilMarker', () => {
    const until = new Date('2026-10-03T16:00:00.000Z')

    it('attaches the marker on its own last line and reads it back', () => {
        const message = blockedUntilMarker.attach({ message: 'HTTP 429: rate limit exceeded', until })
        expect(message).toBe('HTTP 429: rate limit exceeded\n[blocked-until=2026-10-03T16:00:00.000Z]')
        expect(blockedUntilMarker.parse(message)?.toISOString()).toBe(until.toISOString())
    })

    it('reads the marker out of a message wrapped in a friendly connector error JSON', () => {
        const wrapped = JSON.stringify({ __apErrorVersion: 1, message: blockedUntilMarker.attach({ message: 'HTTP 429: x', until }) })
        expect(blockedUntilMarker.parse(wrapped)?.toISOString()).toBe(until.toISOString())
    })

    it('does not stack markers when attached twice', () => {
        const once = blockedUntilMarker.attach({ message: 'boom', until })
        const twice = blockedUntilMarker.attach({ message: once, until: new Date('2026-10-04T16:00:00.000Z') })
        expect(twice.match(/blocked-until/g)).toHaveLength(1)
        expect(blockedUntilMarker.parse(twice)?.toISOString()).toBe('2026-10-04T16:00:00.000Z')
    })

    it('strips the marker and trailing whitespace', () => {
        const message = blockedUntilMarker.attach({ message: 'HTTP 429: x', until })
        expect(blockedUntilMarker.strip(message)).toBe('HTTP 429: x')
        expect(blockedUntilMarker.strip('no marker here')).toBe('no marker here')
    })

    it('ignores a missing, empty or malformed marker', () => {
        expect(blockedUntilMarker.parse(undefined)).toBeNull()
        expect(blockedUntilMarker.parse(null)).toBeNull()
        expect(blockedUntilMarker.parse('HTTP 429')).toBeNull()
        expect(blockedUntilMarker.parse('x\n[blocked-until=not-a-date]')).toBeNull()
    })
})
