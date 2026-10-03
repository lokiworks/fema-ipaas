import { describe, expect, it } from 'vitest'
import { alertDispatcherUtils } from '../../src/app/alert/alert-dispatcher'

const overnight = { enabled: true, from: '22:00', to: '08:00', timezone: 'UTC' }

describe('alertDispatcherUtils.quietHoursEnd', () => {
    it('ends exactly on the configured minute even when the alert fires part way through a minute', () => {
        const end = alertDispatcherUtils.quietHoursEnd({ quietHours: overnight, now: new Date('2026-10-03T23:30:45.500Z') })
        expect(end?.toISOString()).toBe('2026-10-04T08:00:00.000Z')
    })

    it('ends the same day when the alert fires after midnight', () => {
        const end = alertDispatcherUtils.quietHoursEnd({ quietHours: overnight, now: new Date('2026-10-04T03:10:59.999Z') })
        expect(end?.toISOString()).toBe('2026-10-04T08:00:00.000Z')
    })

    it('does not delay anything outside the quiet hours or when they are off', () => {
        expect(alertDispatcherUtils.quietHoursEnd({ quietHours: overnight, now: new Date('2026-10-03T12:00:00Z') })).toBeNull()
        expect(alertDispatcherUtils.quietHoursEnd({ quietHours: { ...overnight, enabled: false }, now: new Date('2026-10-03T23:00:00Z') })).toBeNull()
    })
})
