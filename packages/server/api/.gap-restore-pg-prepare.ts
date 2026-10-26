import fs from 'node:fs/promises'
import { versionUtil } from '@fema-ipaas/server-utils'
import { databaseConnection } from './src/app/database/database-connection'
import { getMigrations } from './src/app/database/postgres-connection'
import { backupEngine } from './src/app/backup/backup-engine'
import { backupFiles } from './src/app/backup/backup.service'
import { encryptUtils } from './src/app/helper/encryption'

async function main() {
    const source = databaseConnection()
    await source.initialize()
    await source.query('CREATE TABLE gap_restore_marker (value integer NOT NULL)')
    await source.query('INSERT INTO gap_restore_marker VALUES (1)')
    const file = '/tmp/ipaas-gap-postgres-restore.dump'
    await backupEngine.dump({ destination: file })
    await fs.writeFile(backupFiles.manifestPathOf({ file }), JSON.stringify({ id: 'isolated-restore-drill', engine: backupEngine.kind(), appVersion: versionUtil.getCurrentRelease(), schemaVersion: getMigrations().at(-1)?.prototype.name ?? new (getMigrations().at(-1)!)().name, databaseVersion: await backupEngine.serverVersion(), checksum: await backupEngine.checksum({ file }), sizeBytes: (await fs.stat(file)).size, keyFingerprint: await encryptUtils.getKeyFingerprint(), counts: await backupFiles.countContents(), startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() }))
    await source.query('INSERT INTO gap_restore_marker VALUES (2)')
    await source.destroy()
}
void main().catch((error: unknown) => { process.stderr.write(String(error)); process.exitCode = 1 })
