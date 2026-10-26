import fs from 'node:fs/promises'
import path from 'node:path'
import { tryCatch } from '@fema-ipaas/core-utils'
import { BackupEngine, BackupRecord, BackupStatus, BackupTrigger, RestoreCheckKind } from '@fema-ipaas/shared'
import { backupEngine } from '../app/backup/backup-engine'
import { backupFiles } from '../app/backup/backup.service'
import { restoreMaintenance } from '../app/backup/maintenance'
import { restorePrecheck } from '../app/backup/restore-precheck.service'
import { databaseConnection } from '../app/database/database-connection'
import { redisConnections } from '../app/database/redis-connections'
import { system } from '../app/helper/system/system'
import { AppSystemProp } from '../app/helper/system/system-props'

async function main(): Promise<void> {
    process.env.TZ = 'UTC'
    const args = process.argv.slice(2)
    if (args.includes('--clear-maintenance')) {
        const owner = await fs.readFile(restoreMaintenance.markerPath(), 'utf8')
        await restoreMaintenance.finish(owner)
        system.globalLogger().info('Restore maintenance cleared. Start the app and workers only after checking the database.')
        return
    }
    const fileArg = args.find((arg) => !arg.startsWith('--'))
    if (!fileArg || !args.includes('--offline')) throw new Error('Usage: fema-restore <backup file> --offline [--check]. Stop all app instances and workers first; use the same configuration, volume and encryption keys.')
    const file = path.resolve(fileArg)
    const manifest = await backupFiles.readManifest(file)
    const local = backupEngine.kind() === BackupEngine.PGLITE
    const release = local ? await restoreMaintenance.lockLocalDatabase() : undefined
    try {
        await restore({ file, manifest, checkOnly: args.includes('--check') })
    }
    finally {
        const source = databaseConnection()
        if (source.isInitialized) await source.destroy()
        await release?.()
    }
}

async function restore({ file, manifest, checkOnly }: { file: string, manifest: Awaited<ReturnType<typeof backupFiles.readManifest>>, checkOnly: boolean }): Promise<void> {
    const source = databaseConnection()
    source.setOptions({ migrationsRun: false, synchronize: false, extra: { application_name: 'fema-restore' } })
    await source.initialize()
    if (manifest.engine === BackupEngine.PG_DUMP) {
        const connections: { count: string }[] = await source.query('SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND application_name <> \'fema-restore\'')
        if (Number(connections[0]?.count) > 0) throw new Error('The database is still in use. Stop every app instance and database client before restoring.')
    }
    const tables: { present: boolean }[] = await source.query('SELECT to_regclass(\'public.project\') IS NOT NULL AS present')
    const current = tables[0]?.present ? await backupFiles.countContents() : { projects: 0, workflows: 0, runs: 0, connections: 0, users: 0 }
    const record = BackupRecord.parse({ ...manifest, tenantId: 'instance-restore', fileName: path.basename(file), status: BackupStatus.SUCCEEDED, trigger: BackupTrigger.MANUAL, created: manifest.startedAt, updated: manifest.finishedAt, error: null, note: null, createdBy: null, uploadedToObjectStorage: false })
    const precheck = await restorePrecheck.inspect({ record, file, directory: path.dirname(file), current })
    system.globalLogger().info({ precheck }, 'Restore precheck')
    if (!precheck.canRestore) throw new Error('Restore precheck failed; no data was replaced')
    const keyCheck = precheck.checks.find((check) => check.kind === RestoreCheckKind.ENCRYPTION_KEY)
    if (!['same', 'retired'].includes(String(keyCheck?.params['relation']))) throw new Error('Restore requires the backup encryption key or its retired key; no data was replaced')
    await source.destroy()
    if (checkOnly) return
    const owner = await restoreMaintenance.begin()
    if (manifest.engine === BackupEngine.PGLITE) {
        const directory = path.resolve(system.getOrThrow(AppSystemProp.CONFIG_PATH))
        const staging = await fs.mkdtemp(path.join(directory, 'restore-staging-'))
        const target = path.join(directory, 'pglite')
        const previous = path.join(directory, `pglite.pre-restore-${Date.now()}`)
        await backupEngine.restore({ file, destination: staging })
        await fs.rename(target, previous)
        const swapped = await tryCatch(() => fs.rename(staging, target))
        if (swapped.error) {
            await fs.rename(previous, target); throw swapped.error 
        }
        system.globalLogger().info({ previousDirectory: previous }, 'Previous database retained for manual recovery')
    }
    else await backupEngine.restore({ file })
    await source.initialize()
    await source.runMigrations({ transaction: 'each' })
    const after = await backupFiles.countContents()
    await source.destroy()
    await restoreMaintenance.finish(owner)
    system.globalLogger().info({ before: current, backup: manifest.counts, after }, 'Restore completed. Start the app and workers, then run full reconciliation. Polling resumes from the backup checkpoint.')
}

void tryCatch(main).then(async ({ error }) => {
    if (error) {
        system.globalLogger().error({ error: error.message }, 'Restore failed. A maintenance flag, if created, remains set. Inspect the database before using --clear-maintenance.'); process.exitCode = 1 
    }
    await redisConnections.destroy()
}).catch((error: unknown) => {
    system.globalLogger().error({ error }, 'Restore cleanup failed'); process.exitCode = 1 
})
