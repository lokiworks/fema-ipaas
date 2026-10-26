import fs from 'node:fs/promises'
import path from 'node:path'
import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { versionUtil } from '@fema-ipaas/server-utils'
import {
    BackupEngine,
    BackupRecord,
    BackupStatus,
    RestoreCheck,
    RestoreCheckKind,
    RestoreCheckLevel,
    RestorePrecheck,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import semver from 'semver'
import { encryptUtils } from '../helper/encryption'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { backupEngine } from './backup-engine'
import { backupFiles, backupService } from './backup.service'

const RESTORE_SPACE_FACTOR = 3

export const restorePrecheckService = (log: FastifyBaseLogger) => ({
    async run({ tenantId, id }: { tenantId: string, id: string }): Promise<RestorePrecheck> {
        const record = await backupService(log).getOneOrThrow({ tenantId, id })
        const directory = backupFiles.directory()
        const file = isNil(record.fileName) ? null : path.join(directory, path.basename(record.fileName))
        return inspect({ record, file, directory, current: await backupFiles.countContents() })

    },
})

async function inspect({ record, file, directory, current }: { record: BackupRecord, file: string | null, directory: string, current: RestorePrecheck['overwrites']['current'] }): Promise<RestorePrecheck> {
    const [fileChecks, keyCheck] = await Promise.all([checkFile({ record, file }), checkEncryptionKey({ record })])
    const checks = [...fileChecks, engineCheck({ record }), versionCheck({ record }), keyCheck, targetCheck({ current }), await spaceCheck({ record, directory })]
    return { backupId: record.id, checkedAt: new Date().toISOString(), canRestore: record.status === BackupStatus.SUCCEEDED && !checks.some((check) => check.level === RestoreCheckLevel.ERROR), checks, overwrites: { current, backup: record.counts ?? null }, target: { engine: record.engine, directory, fileName: record.fileName ?? null, dataDirectory: path.resolve(system.getOrThrow(AppSystemProp.CONFIG_PATH)) } }
}

export const restorePrecheck = { inspect }

async function checkFile({ record, file }: { record: BackupRecord, file: string | null }): Promise<RestoreCheck[]> {
    if (record.status !== BackupStatus.SUCCEEDED || isNil(file)) {
        return [check({ kind: RestoreCheckKind.FILE_PRESENT, level: RestoreCheckLevel.ERROR, params: { reason: 'NO_FILE' } })]
    }
    const { data: stat, error: statError } = await tryCatch(() => fs.stat(file))
    if (statError) {
        return [check({ kind: RestoreCheckKind.FILE_PRESENT, level: RestoreCheckLevel.ERROR, params: { reason: 'MISSING', file } })]
    }
    const sizeMatches = isNil(record.sizeBytes) || stat.size === record.sizeBytes
    const present = check({
        kind: RestoreCheckKind.FILE_PRESENT,
        level: sizeMatches ? RestoreCheckLevel.OK : RestoreCheckLevel.ERROR,
        params: sizeMatches ? { file, sizeBytes: stat.size } : { reason: 'SIZE_DIFFERS', file, expected: record.sizeBytes ?? null, actual: stat.size },
    })
    const [actualChecksum, readable] = await Promise.all([
        backupEngine.checksum({ file }),
        backupEngine.verifyReadable({ file, engine: record.engine }),
    ])
    const checksumOk = isNil(record.checksum) || actualChecksum === record.checksum
    return [
        present,
        check({
            kind: RestoreCheckKind.CHECKSUM,
            level: checksumOk ? RestoreCheckLevel.OK : RestoreCheckLevel.ERROR,
            params: { expected: record.checksum ?? null, actual: actualChecksum },
        }),
        check({
            kind: RestoreCheckKind.READABLE,
            level: readable.ok ? RestoreCheckLevel.OK : RestoreCheckLevel.ERROR,
            params: { verifiedWith: readable.verifiedWith, detail: readable.detail },
        }),
    ]
}

function engineCheck({ record }: { record: BackupRecord }): RestoreCheck {
    const currentEngine = backupEngine.kind()
    return check({
        kind: RestoreCheckKind.ENGINE,
        level: record.engine === currentEngine ? RestoreCheckLevel.OK : RestoreCheckLevel.ERROR,
        params: { backup: record.engine, current: currentEngine },
    })
}

function versionCheck({ record }: { record: BackupRecord }): RestoreCheck {
    const current = versionUtil.getCurrentRelease()
    const relation = relationOf({ backupVersion: record.appVersion, currentVersion: current, schemaVersion: record.schemaVersion ?? null })
    return check({
        kind: RestoreCheckKind.VERSION,
        level: relation === 'same' ? RestoreCheckLevel.OK : relation === 'older' ? RestoreCheckLevel.WARNING : RestoreCheckLevel.ERROR,
        params: { backupVersion: record.appVersion, currentVersion: current, relation },
    })
}

function relationOf({ backupVersion, currentVersion, schemaVersion }: { backupVersion: string, currentVersion: string, schemaVersion: string | null }): 'same' | 'older' | 'newer' | 'unknown' {
    if (backupFiles.isSchemaNewer({ schemaVersion })) {
        return 'newer'
    }
    if (backupVersion === currentVersion) {
        return 'same'
    }
    if (isNil(semver.valid(backupVersion)) || isNil(semver.valid(currentVersion))) {
        return 'unknown'
    }
    return semver.gt(backupVersion, currentVersion) ? 'newer' : 'older'
}

async function checkEncryptionKey({ record }: { record: BackupRecord }): Promise<RestoreCheck> {
    const fingerprint = await encryptUtils.getKeyFingerprint()
    const retired = encryptUtils.getRetiredKeyFingerprints()
    const recorded = record.keyFingerprint ?? null
    if (isNil(recorded) || isNil(fingerprint)) {
        return check({ kind: RestoreCheckKind.ENCRYPTION_KEY, level: RestoreCheckLevel.WARNING, params: { backup: recorded, current: fingerprint, relation: 'unknown' } })
    }
    if (recorded === fingerprint) {
        return check({ kind: RestoreCheckKind.ENCRYPTION_KEY, level: RestoreCheckLevel.OK, params: { backup: recorded, current: fingerprint, relation: 'same' } })
    }
    const relation = retired.includes(recorded) ? 'retired' : 'different'
    return check({
        kind: RestoreCheckKind.ENCRYPTION_KEY,
        level: relation === 'retired' ? RestoreCheckLevel.OK : RestoreCheckLevel.WARNING,
        params: { backup: recorded, current: fingerprint, relation },
    })
}

function targetCheck({ current }: { current: RestorePrecheck['overwrites']['current'] }): RestoreCheck {
    const empty = current.workflows === 0 && current.runs === 0 && current.connections === 0 && current.projects <= 1 && current.users <= 1
    return check({
        kind: RestoreCheckKind.TARGET_DATABASE,
        level: empty ? RestoreCheckLevel.OK : RestoreCheckLevel.WARNING,
        params: { workflows: current.workflows, runs: current.runs, connections: current.connections, projects: current.projects, users: current.users },
    })
}

async function spaceCheck({ record, directory }: { record: BackupRecord, directory: string }): Promise<RestoreCheck> {
    const size = record.sizeBytes ?? 0
    const needed = size * RESTORE_SPACE_FACTOR
    if (record.engine === BackupEngine.PG_DUMP) {
        return check({ kind: RestoreCheckKind.DISK_SPACE, level: RestoreCheckLevel.OK, params: { scope: 'DATABASE_SERVER', neededBytes: needed, freeBytes: null } })
    }
    const disk = await backupFiles.diskUsage({ directory })
    const free = disk.freeBytes
    const level = isNil(free) ? RestoreCheckLevel.WARNING : free < size ? RestoreCheckLevel.ERROR : free < needed ? RestoreCheckLevel.WARNING : RestoreCheckLevel.OK
    return check({ kind: RestoreCheckKind.DISK_SPACE, level, params: { scope: 'DATA_DIRECTORY', neededBytes: needed, freeBytes: free } })
}

function check({ kind, level, params }: RestoreCheck): RestoreCheck {
    return { kind, level, params }
}
