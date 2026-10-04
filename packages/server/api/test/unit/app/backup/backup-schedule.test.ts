import { BackupFrequency, BackupSettings } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { backupSchedule } from '../../../../src/app/backup/backup-schedule'

const DAILY: BackupSettings = { enabled: true, frequency: BackupFrequency.DAILY, weekday: 1, hour: 2, keep: 7, uploadToObjectStorage: false }
const WEEKLY: BackupSettings = { ...DAILY, frequency: BackupFrequency.WEEKLY, weekday: 1 }

describe('backupSchedule', () => {
    it('finds the last daily slot, yesterday before the hour and today after it', () => {
        expect(backupSchedule.lastSlot({ settings: DAILY, now: dayjs('2026-10-04T01:30:00') }).format('YYYY-MM-DD HH:mm')).toBe('2026-10-03 02:00')
        expect(backupSchedule.lastSlot({ settings: DAILY, now: dayjs('2026-10-04T02:00:00') }).format('YYYY-MM-DD HH:mm')).toBe('2026-10-04 02:00')
        expect(backupSchedule.lastSlot({ settings: DAILY, now: dayjs('2026-10-04T15:00:00') }).format('YYYY-MM-DD HH:mm')).toBe('2026-10-04 02:00')
    })

    it('finds the last weekly slot on the chosen weekday', () => {
        expect(backupSchedule.lastSlot({ settings: WEEKLY, now: dayjs('2026-10-04T12:00:00') }).format('YYYY-MM-DD HH:mm')).toBe('2026-09-28 02:00')
        expect(backupSchedule.lastSlot({ settings: WEEKLY, now: dayjs('2026-10-05T01:00:00') }).format('YYYY-MM-DD HH:mm')).toBe('2026-09-28 02:00')
        expect(backupSchedule.lastSlot({ settings: WEEKLY, now: dayjs('2026-10-05T03:00:00') }).format('YYYY-MM-DD HH:mm')).toBe('2026-10-05 02:00')
    })

    it('has no next slot when the schedule is off', () => {
        expect(backupSchedule.nextSlot({ settings: { ...DAILY, enabled: false }, now: dayjs('2026-10-04T12:00:00') })).toBeNull()
        expect(backupSchedule.nextSlot({ settings: DAILY, now: dayjs('2026-10-04T12:00:00') })?.format('YYYY-MM-DD HH:mm')).toBe('2026-10-05 02:00')
        expect(backupSchedule.nextSlot({ settings: WEEKLY, now: dayjs('2026-10-04T12:00:00') })?.format('YYYY-MM-DD HH:mm')).toBe('2026-10-05 02:00')
    })

    it('is due once per slot, and catches up after downtime', () => {
        const now = dayjs('2026-10-04T10:00:00')
        const installedAt = '2026-09-01T00:00:00'
        expect(backupSchedule.isDue({ settings: DAILY, now, lastAttemptAt: null, installedAt })).toBe(true)
        expect(backupSchedule.isDue({ settings: DAILY, now, lastAttemptAt: '2026-10-03T02:00:05', installedAt })).toBe(true)
        expect(backupSchedule.isDue({ settings: DAILY, now, lastAttemptAt: '2026-10-04T02:00:05', installedAt })).toBe(false)
    })

    it('does not back up before the first slot after installation, or when off', () => {
        const now = dayjs('2026-10-04T10:00:00')
        expect(backupSchedule.isDue({ settings: DAILY, now, lastAttemptAt: null, installedAt: '2026-10-04T08:00:00' })).toBe(false)
        expect(backupSchedule.isDue({ settings: { ...DAILY, enabled: false }, now, lastAttemptAt: null, installedAt: '2026-09-01T00:00:00' })).toBe(false)
    })
})
