import { BackupFrequency, BackupSettings } from '@fema-ipaas/shared'
import dayjs, { Dayjs } from 'dayjs'

export const backupSchedule = {
    lastSlot,
    nextSlot,
    isDue,
}

function lastSlot({ settings, now }: { settings: ScheduleSettings, now: Dayjs }): Dayjs {
    if (settings.frequency === BackupFrequency.WEEKLY) {
        const candidate = now.startOf('day').day(settings.weekday).hour(settings.hour)
        return candidate.isAfter(now) ? candidate.subtract(7, 'day') : candidate
    }
    const candidate = now.startOf('day').hour(settings.hour)
    return candidate.isAfter(now) ? candidate.subtract(1, 'day') : candidate
}

function nextSlot({ settings, now }: { settings: BackupSettings, now: Dayjs }): Dayjs | null {
    if (!settings.enabled) {
        return null
    }
    const last = lastSlot({ settings, now })
    return last.add(settings.frequency === BackupFrequency.WEEKLY ? 7 : 1, 'day')
}

function isDue({ settings, now, lastAttemptAt, installedAt }: IsDueParams): boolean {
    if (!settings.enabled) {
        return false
    }
    const slot = lastSlot({ settings, now })
    if (!slot.isAfter(dayjs(installedAt))) {
        return false
    }
    return lastAttemptAt === null || dayjs(lastAttemptAt).isBefore(slot)
}

type ScheduleSettings = Pick<BackupSettings, 'frequency' | 'weekday' | 'hour'>

type IsDueParams = {
    settings: BackupSettings
    now: Dayjs
    lastAttemptAt: string | Date | null
    installedAt: string | Date
}
