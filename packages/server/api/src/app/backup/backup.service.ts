import { createReadStream, existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ApplicationError, ErrorCode, generateId, isNil, tryCatch } from '@fema-ipaas/core-utils'
import { versionUtil, wideEvent } from '@fema-ipaas/server-utils'
import {
    BACKUP_DEFAULT_SETTINGS,
    BackupCounts,
    BackupEngine,
    BackupListItem,
    BackupOverview,
    BackupRecord,
    BackupSettings,
    BackupStatus,
    BackupSummaryForUpgrade,
    BackupTrigger,
    BackupUnrestorableReason,
    FileLocation,
    UpdateBackupSettingsRequestBody,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { ConnectionEntity } from '../connection/connection.entity'
import { repoFactory } from '../core/db/repo-factory'
import { getMigrations } from '../database/postgres-connection'
import { distributedLock } from '../database/redis-connections'
import { s3Helper } from '../file/s3-helper'
import { encryptUtils } from '../helper/encryption'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { projectRepo } from '../project/project-repo'
import { tenantService } from '../tenant/tenant.service'
import { userRepo } from '../user/user-service'
import { ExecutionEntity } from '../workflows/execution/execution-entity'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { backupEngine } from './backup-engine'
import { backupSchedule } from './backup-schedule'
import { BackupRecordEntity, BackupSettingsEntity } from './backup.entity'

const MINIMUM_FREE_BYTES = 64 * 1024 * 1024
const STALE_RUNNING_SECONDS = 180
const HEARTBEAT_MS = 30_000
const MANIFEST_SUFFIX = '.manifest.json'
const FAILED_RECORDS_KEPT = 10
const OBJECT_STORAGE_PREFIX = 'backups'
const ENGINE_CACHE_SECONDS = 60

export const backupRecordRepo = repoFactory(BackupRecordEntity)
export const backupSettingsRepo = repoFactory(BackupSettingsEntity)
const connectionRepo = repoFactory(ConnectionEntity)
const executionCountRepo = repoFactory(ExecutionEntity)

const BackupManifest = z.object({
    id: z.string(),
    engine: z.enum(BackupEngine),
    appVersion: z.string(),
    schemaVersion: z.string().nullable(),
    databaseVersion: z.string().nullable(),
    checksum: z.string(),
    sizeBytes: z.number(),
    keyFingerprint: z.string().nullable(),
    counts: BackupCounts,
    startedAt: z.string(),
    finishedAt: z.string(),
})
type BackupManifest = z.infer<typeof BackupManifest>
const activeBackups = new Set<string>()
let cachedEngine: { at: number, value: Awaited<ReturnType<typeof backupEngine.inspect>> } | null = null

export const backupService = (log: FastifyBaseLogger) => ({
    async getSettings({ tenantId }: TenantScope): Promise<BackupSettings> {
        const saved = await backupSettingsRepo().findOneBy({ tenantId })
        return isNil(saved) ? BACKUP_DEFAULT_SETTINGS : settingsOf({ saved })
    },

    async updateSettings({ tenantId, request }: UpdateSettingsParams): Promise<BackupSettings> {
        if (request.uploadToObjectStorage && system.get(AppSystemProp.FILE_STORAGE_LOCATION) !== FileLocation.S3) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Object storage is not configured, so backups cannot be uploaded to it' },
            })
        }
        const saved = await backupSettingsRepo().findOneBy({ tenantId })
        if (isNil(saved)) {
            await backupSettingsRepo().insert({ id: generateId(), tenantId, ...request })
        }
        else {
            await backupSettingsRepo().update({ id: saved.id, tenantId }, request)
        }
        await applyRetention({ log, tenantId, keep: request.keep })
        log.info({ tenant: { id: tenantId } }, '[backupService#updateSettings] Backup settings updated')
        return this.getSettings({ tenantId })
    },

    async getOverview({ tenantId }: TenantScope): Promise<BackupOverview> {
        await markStaleRunning({ tenantId })
        const [settings, engine, succeeded, fingerprint, disk] = await Promise.all([
            this.getSettings({ tenantId }),
            inspectEngine(),
            backupRecordRepo().findBy({ tenantId, status: BackupStatus.SUCCEEDED }),
            encryptUtils.getKeyFingerprint(),
            diskUsage({ directory: backupDirectory() }),
        ])
        const current = versionUtil.getCurrentRelease()
        const latest = latestOf({ records: succeeded })
        const next = backupSchedule.nextSlot({ settings, now: dayjs() })
        return {
            currentVersion: current,
            engine: {
                kind: engine.kind,
                available: engine.available,
                problem: engine.problem,
                clientVersion: engine.clientVersion,
                serverVersion: engine.serverVersion,
            },
            settings,
            serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            nextRunAt: next?.toISOString() ?? null,
            directory: backupDirectory(),
            directoryMayBeEphemeral: await mayBeEphemeral({ directory: backupDirectory() }),
            disk,
            usedBytes: succeeded.reduce((sum, record) => sum + (record.sizeBytes ?? 0), 0),
            succeededCount: succeeded.length,
            latestSuccess: isNil(latest) || isNil(latest.finishedAt) ? null : {
                id: latest.id,
                finishedAt: latest.finishedAt,
                appVersion: latest.appVersion,
                matchesCurrentVersion: latest.appVersion === current,
            },
            objectStorageAvailable: system.get(AppSystemProp.FILE_STORAGE_LOCATION) === FileLocation.S3,
            keyFingerprint: fingerprint,
        }
    },

    async summaryForUpgrade(): Promise<BackupSummaryForUpgrade> {
        const primary = await tenantService(log).getOldestTenant()
        const [latest, engine] = await Promise.all([
            isNil(primary) ? null : backupRecordRepo().findOne({ where: { tenantId: primary.id, status: BackupStatus.SUCCEEDED }, order: { startedAt: 'DESC' } }),
            inspectEngine(),
        ])
        return {
            latestSuccessAt: latest?.finishedAt ?? null,
            latestSuccessVersion: latest?.appVersion ?? null,
            matchesCurrentVersion: !isNil(latest) && latest.appVersion === versionUtil.getCurrentRelease(),
            engineAvailable: engine.available,
            serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
    },

    async isWorking(): Promise<boolean> {
        const primary = await tenantService(log).getOldestTenant()
        if (isNil(primary)) {
            return false
        }
        const [settings, summary] = await Promise.all([this.getSettings({ tenantId: primary.id }), this.summaryForUpgrade()])
        return settings.enabled && summary.engineAvailable && !isNil(summary.latestSuccessAt)
    },

    async latestSuccessAt(): Promise<string | null> {
        const summary = await this.summaryForUpgrade()
        return summary.latestSuccessAt ?? null
    },

    async list({ tenantId }: TenantScope): Promise<BackupListItem[]> {
        await markStaleRunning({ tenantId })
        const records = await backupRecordRepo().find({ where: { tenantId }, order: { startedAt: 'DESC' } })
        return records.map((record) => ({ ...record, ...restorability({ record }) }))
    },

    async getOneOrThrow({ tenantId, id }: TenantScope & { id: string }): Promise<BackupRecord> {
        const record = await backupRecordRepo().findOneBy({ id, tenantId })
        if (isNil(record)) {
            throw new ApplicationError({ code: ErrorCode.ENTITY_NOT_FOUND, params: { entityType: 'backup', entityId: id } })
        }
        return record
    },

    async start({ tenantId, trigger, createdBy, note }: StartParams): Promise<BackupRecord> {
        const record = await distributedLock(log).runExclusive({
            key: `backup:start:${tenantId}`,
            timeoutInSeconds: 30,
            fn: async () => {
                await markStaleRunning({ tenantId })
                const running = await backupRecordRepo().findOneBy({ tenantId, status: BackupStatus.RUNNING })
                if (!isNil(running)) {
                    throw new ApplicationError({
                        code: ErrorCode.VALIDATION,
                        params: { message: 'A backup is already running. Wait for it to finish.' },
                    })
                }
                const engine = await inspectEngine()
                if (!engine.available && trigger === BackupTrigger.MANUAL) {
                    throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: unavailableMessage({ engine }) } })
                }
                const created = await insertRecord({ tenantId, trigger, createdBy, note, status: engine.available ? BackupStatus.RUNNING : BackupStatus.FAILED, error: engine.available ? null : unavailableMessage({ engine }) })
                return created
            },
        })
        if (record.status === BackupStatus.FAILED) {
            return record
        }
        const execution = wideEvent.detached({ fn: () => execute({ log: system.globalLogger(), record }) })
        if (trigger === BackupTrigger.SCHEDULED) {
            await execution
        }
        else {
            void execution
        }
        return record
    },

    async remove({ tenantId, id }: TenantScope & { id: string }): Promise<void> {
        const record = await this.getOneOrThrow({ tenantId, id })
        if (record.status === BackupStatus.RUNNING) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'A running backup cannot be deleted. Wait for it to finish.' },
            })
        }
        await deleteRecordFiles({ log, record })
        await backupRecordRepo().delete({ id, tenantId })
    },

    async runDue(): Promise<void> {
        const tenant = await tenantService(log).getOldestTenant()
        if (isNil(tenant)) {
            return
        }
        const settings = await this.getSettings({ tenantId: tenant.id })
        const lastAttempt = await backupRecordRepo().findOne({ where: { tenantId: tenant.id, trigger: BackupTrigger.SCHEDULED }, order: { startedAt: 'DESC' } })
        const due = backupSchedule.isDue({
            settings,
            now: dayjs(),
            lastAttemptAt: lastAttempt?.startedAt ?? null,
            installedAt: tenant.created,
        })
        if (!due) {
            return
        }
        const { error } = await tryCatch(() => this.start({ tenantId: tenant.id, trigger: BackupTrigger.SCHEDULED, createdBy: null, note: null }))
        if (!isNil(error)) {
            log.warn({ error }, '[backupService#runDue] Scheduled backup could not start')
        }
    },
})

async function execute({ log, record }: { log: FastifyBaseLogger, record: BackupRecord }): Promise<void> {
    activeBackups.add(record.id)
    const heartbeat = setInterval(() => {
        void backupRecordRepo().update({ id: record.id, tenantId: record.tenantId }, { status: BackupStatus.RUNNING })
    }, HEARTBEAT_MS)
    const { error } = await tryCatch(() => produce({ log, record }))
    clearInterval(heartbeat)
    activeBackups.delete(record.id)
    if (isNil(error)) {
        return
    }
    log.error({ error, backup: { id: record.id } }, '[backupService#execute] Backup failed')
    await backupRecordRepo().update({ id: record.id, tenantId: record.tenantId }, {
        status: BackupStatus.FAILED,
        finishedAt: new Date().toISOString(),
        error: describeFailure({ error }),
    })
}

async function produce({ log, record }: { log: FastifyBaseLogger, record: BackupRecord }): Promise<void> {
    const directory = backupDirectory()
    await fs.mkdir(directory, { recursive: true })
    await assertFreeSpace({ tenantId: record.tenantId, directory })
    const counts = await countContents()
    const fileName = fileNameOf({ record })
    const finalPath = path.join(directory, fileName)
    const partialPath = `${finalPath}.partial`
    await backupEngine.dump({ destination: partialPath })
    await fs.rename(partialPath, finalPath)
    const [checksum, stat, readable, fingerprint, databaseVersion] = await Promise.all([
        backupEngine.checksum({ file: finalPath }),
        fs.stat(finalPath),
        backupEngine.verifyReadable({ file: finalPath, engine: record.engine }),
        encryptUtils.getKeyFingerprint(),
        backupEngine.serverVersion(),
    ])
    if (!readable.ok) {
        await fs.rm(finalPath, { force: true })
        throw new Error(readable.detail ?? 'The backup file could not be read back')
    }
    const finishedAt = new Date().toISOString()
    await writeManifest({
        file: finalPath,
        manifest: {
            id: record.id,
            engine: record.engine,
            appVersion: record.appVersion,
            schemaVersion: record.schemaVersion ?? null,
            databaseVersion,
            checksum,
            sizeBytes: stat.size,
            keyFingerprint: fingerprint,
            counts,
            startedAt: record.startedAt,
            finishedAt,
        },
    })
    const uploaded = await uploadIfWanted({ log, tenantId: record.tenantId, file: finalPath, fileName })
    await backupRecordRepo().update({ id: record.id, tenantId: record.tenantId }, {
        status: BackupStatus.SUCCEEDED,
        fileName,
        sizeBytes: stat.size,
        checksum,
        keyFingerprint: fingerprint,
        databaseVersion,
        counts,
        finishedAt,
        error: uploaded.error,
        uploadedToObjectStorage: uploaded.done,
    })
    if (record.trigger === BackupTrigger.SCHEDULED) {
        const settings = await backupService(log).getSettings({ tenantId: record.tenantId })
        await applyRetention({ log, tenantId: record.tenantId, keep: settings.keep })
    }
    log.info({ backup: { id: record.id, sizeBytes: stat.size, trigger: record.trigger } }, '[backupService#execute] Backup finished')
}

async function insertRecord({ tenantId, trigger, createdBy, note, status, error }: InsertParams): Promise<BackupRecord> {
    const now = new Date().toISOString()
    const migrations = getMigrations().map((Migration) => new Migration().name)
    const id = generateId()
    await backupRecordRepo().insert({
        id,
        tenantId,
        status,
        trigger,
        engine: backupEngine.kind(),
        appVersion: versionUtil.getCurrentRelease(),
        schemaVersion: migrations[migrations.length - 1] ?? null,
        databaseVersion: null,
        fileName: null,
        sizeBytes: null,
        checksum: null,
        keyFingerprint: null,
        startedAt: now,
        finishedAt: status === BackupStatus.RUNNING ? null : now,
        error,
        note: isNil(note) || note.trim().length === 0 ? null : note.trim(),
        createdBy,
        counts: null,
        uploadedToObjectStorage: false,
    })
    return backupRecordRepo().findOneByOrFail({ id, tenantId })
}

async function applyRetention({ log, tenantId, keep }: { log: FastifyBaseLogger, tenantId: string, keep: number }): Promise<void> {
    const scheduled = await backupRecordRepo().find({
        where: { tenantId, trigger: BackupTrigger.SCHEDULED, status: BackupStatus.SUCCEEDED },
        order: { startedAt: 'DESC' },
    })
    const failed = await backupRecordRepo().find({ where: { tenantId, status: BackupStatus.FAILED }, order: { startedAt: 'DESC' } })
    const expired = [...scheduled.slice(keep), ...failed.slice(FAILED_RECORDS_KEPT)]
    for (const record of expired) {
        await deleteRecordFiles({ log, record })
        await backupRecordRepo().delete({ id: record.id, tenantId })
    }
}

async function deleteRecordFiles({ log, record }: { log: FastifyBaseLogger, record: BackupRecord }): Promise<void> {
    if (isNil(record.fileName)) {
        return
    }
    const file = path.join(backupDirectory(), path.basename(record.fileName))
    await fs.rm(file, { force: true })
    await fs.rm(manifestPathOf({ file }), { force: true })
    if (record.uploadedToObjectStorage) {
        const { error } = await tryCatch(() => s3Helper(log).deleteFiles([objectKeyOf({ fileName: record.fileName ?? '' })]))
        if (!isNil(error)) {
            log.warn({ error, backup: { id: record.id } }, '[backupService#remove] Could not delete the copy in object storage')
        }
    }
}

async function uploadIfWanted({ log, tenantId, file, fileName }: UploadParams): Promise<{ done: boolean, error: string | null }> {
    const settings = await backupService(log).getSettings({ tenantId })
    if (!settings.uploadToObjectStorage || system.get(AppSystemProp.FILE_STORAGE_LOCATION) !== FileLocation.S3) {
        return { done: false, error: null }
    }
    const { error } = await tryCatch(() => s3Helper(log).uploadStream(objectKeyOf({ fileName }), createReadStream(file)))
    if (!isNil(error)) {
        log.warn({ error }, '[backupService#execute] Upload to object storage failed; the local copy is kept')
        return { done: false, error: `The backup is saved locally, but the upload to object storage failed: ${describeFailure({ error })}` }
    }
    return { done: true, error: null }
}

async function markStaleRunning({ tenantId }: TenantScope): Promise<void> {
    const running = await backupRecordRepo().findBy({ tenantId, status: BackupStatus.RUNNING })
    const orphans = running.filter((record) => !activeBackups.has(record.id))
    for (const record of orphans) {
        const manifest = await findManifest({ id: record.id })
        if (!isNil(manifest)) {
            await backupRecordRepo().update({ id: record.id, tenantId }, {
                status: BackupStatus.SUCCEEDED,
                fileName: manifest.fileName,
                sizeBytes: manifest.sizeBytes,
                checksum: manifest.checksum,
                keyFingerprint: manifest.keyFingerprint,
                databaseVersion: manifest.databaseVersion,
                counts: manifest.counts,
                finishedAt: manifest.finishedAt,
                error: null,
            })
            continue
        }
        if (dayjs().diff(dayjs(record.updated), 'second') > STALE_RUNNING_SECONDS) {
            await backupRecordRepo().update({ id: record.id, tenantId }, {
                status: BackupStatus.FAILED,
                finishedAt: new Date().toISOString(),
                error: 'The server stopped while this backup was running',
            })
        }
    }
}

async function findManifest({ id }: { id: string }): Promise<(BackupManifest & { fileName: string }) | null> {
    const directory = backupDirectory()
    const { data: names, error } = await tryCatch(() => fs.readdir(directory))
    if (error) {
        return null
    }
    for (const name of names.filter((entry) => entry.endsWith(MANIFEST_SUFFIX))) {
        const { data: raw } = await tryCatch<unknown>(async () => JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')))
        const parsed = BackupManifest.safeParse(raw)
        const fileName = name.slice(0, -MANIFEST_SUFFIX.length)
        if (parsed.success && parsed.data.id === id && existsSync(path.join(directory, fileName))) {
            return { ...parsed.data, fileName }
        }
    }
    return null
}

async function assertFreeSpace({ tenantId, directory }: { tenantId: string, directory: string }): Promise<void> {
    const disk = await diskUsage({ directory })
    if (isNil(disk.freeBytes)) {
        return
    }
    const latest = await backupRecordRepo().findOne({ where: { tenantId, status: BackupStatus.SUCCEEDED }, order: { startedAt: 'DESC' } })
    const estimate = isNil(latest?.sizeBytes) ? Math.floor(((await backupEngine.databaseSizeBytes()) ?? 0) / 2) : Math.ceil(latest.sizeBytes * 1.5)
    const needed = Math.max(MINIMUM_FREE_BYTES, estimate)
    if (disk.freeBytes < needed) {
        throw new Error(`Not enough free disk space in ${directory}: ${megabytes({ bytes: disk.freeBytes })} MB free, about ${megabytes({ bytes: needed })} MB needed`)
    }
}

async function countContents(): Promise<BackupCounts> {
    const [projects, workflows, runs, connections, users] = await Promise.all([
        projectRepo().count(),
        workflowRepo().count(),
        executionCountRepo().count(),
        connectionRepo().count(),
        userRepo().count(),
    ])
    return { projects, workflows, runs, connections, users }
}

async function inspectEngine(): Promise<Awaited<ReturnType<typeof backupEngine.inspect>>> {
    const now = Date.now()
    if (!isNil(cachedEngine) && now - cachedEngine.at < ENGINE_CACHE_SECONDS * 1000) {
        return cachedEngine.value
    }
    const value = await backupEngine.inspect()
    cachedEngine = { at: now, value }
    return value
}

function restorability({ record }: { record: BackupRecord }): Pick<BackupListItem, 'restorable' | 'unrestorableReason'> {
    const reason = unrestorableReasonOf({ record })
    return { restorable: isNil(reason), unrestorableReason: reason }
}

function unrestorableReasonOf({ record }: { record: BackupRecord }): BackupUnrestorableReason | null {
    if (record.status === BackupStatus.RUNNING) {
        return BackupUnrestorableReason.RUNNING
    }
    if (record.status === BackupStatus.FAILED || isNil(record.fileName)) {
        return BackupUnrestorableReason.FAILED
    }
    if (!existsSync(path.join(backupDirectory(), path.basename(record.fileName)))) {
        return BackupUnrestorableReason.FILE_MISSING
    }
    if (record.engine !== backupEngine.kind()) {
        return BackupUnrestorableReason.ENGINE_MISMATCH
    }
    if (isSchemaNewer({ schemaVersion: record.schemaVersion ?? null })) {
        return BackupUnrestorableReason.NEWER_VERSION
    }
    return null
}

function isSchemaNewer({ schemaVersion }: { schemaVersion: string | null }): boolean {
    if (isNil(schemaVersion)) {
        return false
    }
    return !getMigrations().some((Migration) => new Migration().name === schemaVersion)
}

function latestOf({ records }: { records: BackupRecord[] }): BackupRecord | null {
    return records.reduce<BackupRecord | null>((latest, record) => isNil(latest) || dayjs(record.startedAt).isAfter(dayjs(latest.startedAt)) ? record : latest, null)
}

function settingsOf({ saved }: { saved: BackupSettings }): BackupSettings {
    return {
        enabled: saved.enabled,
        frequency: saved.frequency,
        weekday: saved.weekday,
        hour: saved.hour,
        keep: saved.keep,
        uploadToObjectStorage: saved.uploadToObjectStorage,
    }
}

function backupDirectory(): string {
    return path.resolve(system.getOrThrow(AppSystemProp.CONFIG_PATH), 'backups')
}

function fileNameOf({ record }: { record: BackupRecord }): string {
    const stamp = dayjs(record.startedAt).format('YYYYMMDD-HHmmss')
    return `fema-${stamp}-${record.id.slice(0, 6)}.${backupEngine.fileExtension()}`
}

function manifestPathOf({ file }: { file: string }): string {
    return `${file}.manifest.json`
}

function objectKeyOf({ fileName }: { fileName: string }): string {
    return `${OBJECT_STORAGE_PREFIX}/${fileName}`
}

async function writeManifest({ file, manifest }: { file: string, manifest: BackupManifest }): Promise<void> {
    await fs.writeFile(manifestPathOf({ file }), JSON.stringify(manifest, null, 2))
}

async function diskUsage({ directory }: { directory: string }): Promise<{ freeBytes: number | null, totalBytes: number | null }> {
    const { data, error } = await tryCatch(async () => {
        await fs.mkdir(directory, { recursive: true })
        return fs.statfs(directory)
    })
    if (error) {
        return { freeBytes: null, totalBytes: null }
    }
    return { freeBytes: Number(data.bavail) * Number(data.bsize), totalBytes: Number(data.blocks) * Number(data.bsize) }
}

async function mayBeEphemeral({ directory }: { directory: string }): Promise<boolean> {
    const inContainer = existsSync('/.dockerenv') || !isNil(process.env.KUBERNETES_SERVICE_HOST)
    if (!inContainer) {
        return false
    }
    const { data, error } = await tryCatch(async () => {
        await fs.mkdir(directory, { recursive: true })
        const [target, root] = await Promise.all([fs.stat(directory), fs.stat('/')])
        return target.dev === root.dev
    })
    return error ? false : data
}

function unavailableMessage({ engine }: { engine: Awaited<ReturnType<typeof backupEngine.inspect>> }): string {
    return isNil(engine.clientVersion)
        ? 'pg_dump is not installed on this server, so backups cannot run here'
        : `pg_dump ${engine.clientVersion} is older than the database server ${engine.serverVersion ?? ''}, so it refuses to dump it`.trim()
}

function describeFailure({ error }: { error: unknown }): string {
    const raw = error instanceof Error ? error.message : String(error)
    const secrets = [system.get(AppSystemProp.POSTGRES_PASSWORD)].filter((value): value is string => !isNil(value) && value.length > 0)
    const cleaned = secrets.reduce((message, secret) => message.split(secret).join('***'), raw)
    return cleaned.length > 500 ? `${cleaned.slice(0, 500)}...` : cleaned
}

function megabytes({ bytes }: { bytes: number }): number {
    return Math.round(bytes / (1024 * 1024))
}

export const backupFiles = {
    directory: backupDirectory,
    manifestPathOf,
    diskUsage,
    countContents,
    isSchemaNewer,
}

type TenantScope = {
    tenantId: string
}

type UpdateSettingsParams = TenantScope & {
    request: UpdateBackupSettingsRequestBody
}

type StartParams = TenantScope & {
    trigger: BackupTrigger
    createdBy: string | null
    note: string | null | undefined
}

type InsertParams = StartParams & {
    status: BackupStatus
    error: string | null
}

type UploadParams = TenantScope & {
    log: FastifyBaseLogger
    file: string
    fileName: string
}
