import { BaseModelSchema, DateOrString, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

const KEEP_MIN = 1
const KEEP_MAX = 90
const NOTE_MAX_LENGTH = 40

export enum BackupStatus {
    RUNNING = 'RUNNING',
    SUCCEEDED = 'SUCCEEDED',
    FAILED = 'FAILED',
}

export enum BackupTrigger {
    MANUAL = 'MANUAL',
    SCHEDULED = 'SCHEDULED',
}

export enum BackupEngine {
    PG_DUMP = 'PG_DUMP',
    PGLITE = 'PGLITE',
}

export enum BackupFrequency {
    DAILY = 'DAILY',
    WEEKLY = 'WEEKLY',
}

export enum BackupEngineProblem {
    PG_DUMP_MISSING = 'PG_DUMP_MISSING',
    PG_DUMP_TOO_OLD = 'PG_DUMP_TOO_OLD',
}

export enum BackupUnrestorableReason {
    FAILED = 'FAILED',
    RUNNING = 'RUNNING',
    FILE_MISSING = 'FILE_MISSING',
    ENGINE_MISMATCH = 'ENGINE_MISMATCH',
    NEWER_VERSION = 'NEWER_VERSION',
}

export enum RestoreCheckKind {
    FILE_PRESENT = 'FILE_PRESENT',
    CHECKSUM = 'CHECKSUM',
    READABLE = 'READABLE',
    ENGINE = 'ENGINE',
    VERSION = 'VERSION',
    ENCRYPTION_KEY = 'ENCRYPTION_KEY',
    TARGET_DATABASE = 'TARGET_DATABASE',
    DISK_SPACE = 'DISK_SPACE',
}

export enum RestoreCheckLevel {
    OK = 'OK',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
}

export const BackupCounts = z.object({
    projects: z.number(),
    workflows: z.number(),
    runs: z.number(),
    connections: z.number(),
    users: z.number(),
})

export const BackupRecord = z.object({
    ...BaseModelSchema,
    tenantId: z.string(),
    status: z.enum(BackupStatus),
    trigger: z.enum(BackupTrigger),
    engine: z.enum(BackupEngine),
    appVersion: z.string(),
    schemaVersion: Nullable(z.string()),
    databaseVersion: Nullable(z.string()),
    fileName: Nullable(z.string()),
    sizeBytes: Nullable(z.number()),
    checksum: Nullable(z.string()),
    keyFingerprint: Nullable(z.string()),
    startedAt: DateOrString,
    finishedAt: Nullable(DateOrString),
    error: Nullable(z.string()),
    note: Nullable(z.string()),
    createdBy: Nullable(z.string()),
    counts: Nullable(BackupCounts),
    uploadedToObjectStorage: z.boolean(),
})

export const BackupListItem = BackupRecord.extend({
    restorable: z.boolean(),
    unrestorableReason: Nullable(z.enum(BackupUnrestorableReason)),
})

export const BackupSettings = z.object({
    enabled: z.boolean(),
    frequency: z.enum(BackupFrequency),
    weekday: z.number().int().min(0).max(6),
    hour: z.number().int().min(0).max(23),
    keep: z.number().int().min(1).max(90),
    uploadToObjectStorage: z.boolean(),
})

export const UpdateBackupSettingsRequestBody = z.object({
    enabled: z.boolean(),
    frequency: z.enum(BackupFrequency),
    weekday: z.number().int().min(0, 'backupWeekdayRange').max(6, 'backupWeekdayRange'),
    hour: z.number().int().min(0, 'backupHourRange').max(23, 'backupHourRange'),
    keep: z.number().int('backupKeepRange').min(KEEP_MIN, 'backupKeepRange').max(KEEP_MAX, 'backupKeepRange'),
    uploadToObjectStorage: z.boolean(),
})

export const CreateBackupRequestBody = z.object({
    note: z.string().trim().max(NOTE_MAX_LENGTH, 'backupNoteTooLong').optional(),
})

export const BackupOverview = z.object({
    currentVersion: z.string(),
    engine: z.object({
        kind: z.enum(BackupEngine),
        available: z.boolean(),
        problem: Nullable(z.enum(BackupEngineProblem)),
        clientVersion: Nullable(z.string()),
        serverVersion: Nullable(z.string()),
    }),
    settings: BackupSettings,
    serverTimezone: z.string(),
    nextRunAt: Nullable(z.string()),
    directory: z.string(),
    directoryMayBeEphemeral: z.boolean(),
    disk: z.object({
        freeBytes: Nullable(z.number()),
        totalBytes: Nullable(z.number()),
    }),
    usedBytes: z.number(),
    succeededCount: z.number(),
    latestSuccess: Nullable(z.object({
        id: z.string(),
        finishedAt: z.string(),
        appVersion: z.string(),
        matchesCurrentVersion: z.boolean(),
    })),
    objectStorageAvailable: z.boolean(),
    keyFingerprint: Nullable(z.string()),
})

export const RestoreCheck = z.object({
    kind: z.enum(RestoreCheckKind),
    level: z.enum(RestoreCheckLevel),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
})

export const RestorePrecheck = z.object({
    backupId: z.string(),
    checkedAt: z.string(),
    canRestore: z.boolean(),
    checks: z.array(RestoreCheck),
    overwrites: z.object({
        current: BackupCounts,
        backup: Nullable(BackupCounts),
    }),
    target: z.object({
        engine: z.enum(BackupEngine),
        directory: z.string(),
        fileName: Nullable(z.string()),
        dataDirectory: z.string(),
    }),
})

export const BackupSummaryForUpgrade = z.object({
    latestSuccessAt: Nullable(z.string()),
    latestSuccessVersion: Nullable(z.string()),
    matchesCurrentVersion: z.boolean(),
    engineAvailable: z.boolean(),
})

export const BACKUP_KEEP_MIN = KEEP_MIN
export const BACKUP_KEEP_MAX = KEEP_MAX
export const BACKUP_NOTE_MAX_LENGTH = NOTE_MAX_LENGTH
export const BACKUP_DEFAULT_SETTINGS: BackupSettings = {
    enabled: true,
    frequency: BackupFrequency.DAILY,
    weekday: 1,
    hour: 2,
    keep: 7,
    uploadToObjectStorage: false,
}

export type BackupCounts = z.infer<typeof BackupCounts>
export type BackupRecord = z.infer<typeof BackupRecord>
export type BackupListItem = z.infer<typeof BackupListItem>
export type BackupSettings = z.infer<typeof BackupSettings>
export type UpdateBackupSettingsRequestBody = z.infer<typeof UpdateBackupSettingsRequestBody>
export type CreateBackupRequestBody = z.infer<typeof CreateBackupRequestBody>
export type BackupOverview = z.infer<typeof BackupOverview>
export type RestoreCheck = z.infer<typeof RestoreCheck>
export type RestorePrecheck = z.infer<typeof RestorePrecheck>
export type BackupSummaryForUpgrade = z.infer<typeof BackupSummaryForUpgrade>
