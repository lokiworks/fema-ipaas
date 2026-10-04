import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import { createGunzip } from 'node:zlib'
import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { BackupEngine, BackupEngineProblem } from '@fema-ipaas/shared'
import { getPGliteInstance } from 'typeorm-pglite'
import { databaseConnection } from '../database/database-connection'
import { DatabaseType } from '../database/database-type'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

const COMMAND_TIMEOUT_MS = 60 * 60 * 1000
const PROBE_TIMEOUT_MS = 10 * 1000
const STDERR_LIMIT = 4000
const PG_DUMP_MAGIC = 'PGDMP'
const OPEN_DATABASE_SCRIPT = `
;(async () => {
    const { PGlite } = await import(process.argv[1])
    const { vector } = await import(process.argv[2])
    const database = await PGlite.create({ dataDir: process.argv[3], extensions: { vector } })
    await database.query('SELECT count(*) FROM information_schema.tables')
    await database.close()
})().catch((error) => {
    console.error(String((error && error.message) || error))
    process.exit(1)
})
`
const PG_VERSION_ENTRY = /(^|\/)PG_VERSION$/m

export const backupEngine = {
    kind,
    fileExtension,
    inspect,
    dump,
    checksum,
    verifyReadable,
    serverVersion,
    databaseSizeBytes,
}

function kind(): BackupEngine {
    return system.get(AppSystemProp.DB_TYPE) === DatabaseType.PGLITE ? BackupEngine.PGLITE : BackupEngine.PG_DUMP
}

function fileExtension(): string {
    return kind() === BackupEngine.PGLITE ? 'pglite.tar.gz' : 'dump'
}

async function inspect(): Promise<EngineInspection> {
    if (kind() === BackupEngine.PGLITE) {
        return { kind: BackupEngine.PGLITE, available: true, problem: null, clientVersion: null, serverVersion: null }
    }
    const [client, server] = await Promise.all([probeClient({ command: 'pg_dump' }), serverVersion()])
    if (isNil(client)) {
        return { kind: BackupEngine.PG_DUMP, available: false, problem: BackupEngineProblem.PG_DUMP_MISSING, clientVersion: null, serverVersion: server }
    }
    const clientMajor = majorOf({ version: client })
    const serverMajor = majorOf({ version: server })
    if (!isNil(clientMajor) && !isNil(serverMajor) && clientMajor < serverMajor) {
        return { kind: BackupEngine.PG_DUMP, available: false, problem: BackupEngineProblem.PG_DUMP_TOO_OLD, clientVersion: client, serverVersion: server }
    }
    return { kind: BackupEngine.PG_DUMP, available: true, problem: null, clientVersion: client, serverVersion: server }
}

async function dump({ destination }: { destination: string }): Promise<void> {
    if (kind() === BackupEngine.PGLITE) {
        const pglite = await getPGliteInstance()
        const archive = await pglite.transaction(async (transaction) => {
            await transaction.exec('CHECKPOINT')
            return pglite.dumpDataDir('gzip')
        })
        await fs.writeFile(destination, Buffer.from(await archive.arrayBuffer()))
        return
    }
    const { error } = await tryCatch(() => run({
        command: 'pg_dump',
        args: ['--format=custom', '--no-owner', `--file=${destination}`],
        env: connectionEnvironment(),
        timeoutMs: COMMAND_TIMEOUT_MS,
    }))
    if (!isNil(error)) {
        await fs.rm(destination, { force: true })
        throw error
    }
}

async function checksum({ file }: { file: string }): Promise<string> {
    const hash = createHash('sha256')
    await pipeline(createReadStream(file), hash)
    return hash.digest('hex')
}

async function verifyReadable({ file, engine }: { file: string, engine: BackupEngine }): Promise<ReadableResult> {
    return engine === BackupEngine.PGLITE ? verifyPgliteArchive({ file }) : verifyPgDumpArchive({ file })
}

async function verifyPgliteArchive({ file }: { file: string }): Promise<ReadableResult> {
    const { error } = await tryCatch(() => pipeline(createReadStream(file), createGunzip(), drain()))
    if (!isNil(error)) {
        return { ok: false, verifiedWith: null, detail: 'The archive is not a complete gzip file' }
    }
    const { data: listing, error: tarError } = await tryCatch(() => run({ command: 'tar', args: ['-tzf', file], env: {}, timeoutMs: PROBE_TIMEOUT_MS }))
    if (tarError) {
        return { ok: true, verifiedWith: 'gzip', detail: null }
    }
    if (!PG_VERSION_ENTRY.test(listing)) {
        return { ok: false, verifiedWith: 'tar', detail: 'The archive does not contain a database directory' }
    }
    const { error: openError } = await tryCatch(() => openArchivedDatabase({ file }))
    return openError
        ? { ok: false, verifiedWith: 'open', detail: `The database inside the archive does not start: ${openError.message.slice(0, 200)}` }
        : { ok: true, verifiedWith: 'open', detail: null }
}

function esmEntryOf({ specifier, file }: { specifier: string, file: string }): string {
    return pathToFileURL(path.join(path.dirname(require.resolve(specifier)), file)).href
}

async function openArchivedDatabase({ file }: { file: string }): Promise<void> {
    const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'fema-backup-open-'))
    try {
        await run({ command: 'tar', args: ['-xzf', file, '-C', workdir], env: {}, timeoutMs: COMMAND_TIMEOUT_MS })
        await run({
            command: process.execPath,
            args: ['-e', OPEN_DATABASE_SCRIPT, esmEntryOf({ specifier: '@electric-sql/pglite', file: 'index.js' }), esmEntryOf({ specifier: '@electric-sql/pglite/vector', file: 'index.js' }), workdir],
            env: {},
            timeoutMs: COMMAND_TIMEOUT_MS,
        })
    }
    finally {
        await fs.rm(workdir, { recursive: true, force: true })
    }
}

async function verifyPgDumpArchive({ file }: { file: string }): Promise<ReadableResult> {
    const header = await readHeader({ file, length: PG_DUMP_MAGIC.length })
    if (header !== PG_DUMP_MAGIC) {
        return { ok: false, verifiedWith: null, detail: 'The file is not a pg_dump custom-format archive' }
    }
    const { error: restoreError } = await tryCatch(() => run({ command: 'pg_restore', args: ['--list', file], env: {}, timeoutMs: PROBE_TIMEOUT_MS }))
    if (!isNil(restoreError)) {
        return commandMissing({ error: restoreError })
            ? { ok: true, verifiedWith: 'header', detail: null }
            : { ok: false, verifiedWith: 'pg_restore', detail: 'pg_restore could not read the archive table of contents' }
    }
    return { ok: true, verifiedWith: 'pg_restore', detail: null }
}

async function readHeader({ file, length }: { file: string, length: number }): Promise<string> {
    const handle = await fs.open(file, 'r')
    const { error, data } = await tryCatch(async () => {
        const buffer = Buffer.alloc(length)
        await handle.read(buffer, 0, length, 0)
        return buffer.toString('latin1')
    })
    await handle.close()
    return error ? '' : data
}

async function serverVersion(): Promise<string | null> {
    const { data, error } = await tryCatch<Array<{ server_version: string }>>(() => databaseConnection().query('SHOW server_version'))
    return error ? null : data[0]?.server_version ?? null
}

async function databaseSizeBytes(): Promise<number | null> {
    const { data, error } = await tryCatch<Array<{ size: string | number }>>(() => databaseConnection().query('SELECT pg_database_size(current_database()) AS size'))
    if (error || isNil(data[0])) {
        return null
    }
    return Number(data[0].size)
}

async function probeClient({ command }: { command: string }): Promise<string | null> {
    const { data, error } = await tryCatch(() => run({ command, args: ['--version'], env: {}, timeoutMs: PROBE_TIMEOUT_MS }))
    if (error) {
        return null
    }
    return /(\d+(\.\d+)*)/.exec(data)?.[1] ?? null
}

function drain(): Writable {
    return new Writable({
        write(_chunk, _encoding, callback) {
            callback()
        },
    })
}

function majorOf({ version }: { version: string | null }): number | null {
    if (isNil(version)) {
        return null
    }
    const major = Number.parseInt(version.split('.')[0] ?? '', 10)
    return Number.isNaN(major) ? null : major
}

function connectionEnvironment(): Record<string, string> {
    const url = system.get(AppSystemProp.POSTGRES_URL)
    const ssl = system.get(AppSystemProp.POSTGRES_USE_SSL) === 'true'
    const common: Record<string, string> = ssl ? { PGSSLMODE: 'require' } : {}
    if (!isNil(url)) {
        const parsed = new URL(url)
        const sslMode = parsed.searchParams.get('sslmode')
        return {
            ...common,
            ...(isNil(sslMode) ? {} : { PGSSLMODE: sslMode }),
            PGHOST: parsed.hostname,
            PGPORT: parsed.port.length > 0 ? parsed.port : '5432',
            PGUSER: decodeURIComponent(parsed.username),
            PGPASSWORD: decodeURIComponent(parsed.password),
            PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
        }
    }
    return {
        ...common,
        PGHOST: system.getOrThrow(AppSystemProp.POSTGRES_HOST),
        PGPORT: system.getOrThrow(AppSystemProp.POSTGRES_PORT),
        PGUSER: system.getOrThrow(AppSystemProp.POSTGRES_USERNAME),
        PGPASSWORD: system.getOrThrow(AppSystemProp.POSTGRES_PASSWORD),
        PGDATABASE: system.getOrThrow(AppSystemProp.POSTGRES_DATABASE),
    }
}

function commandMissing({ error }: { error: unknown }): boolean {
    return error instanceof CommandError && error.missing
}

function run({ command, args, env, timeoutMs }: RunParams): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const child = spawn(command, args, {
            env: { PATH: process.env.PATH ?? '', ...env },
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: timeoutMs,
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk: Buffer) => {
            stdout = (stdout + chunk.toString('utf8')).slice(0, 1_000_000)
        })
        child.stderr.on('data', (chunk: Buffer) => {
            stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_LIMIT)
        })
        child.on('error', (error: NodeJS.ErrnoException) => {
            reject(new CommandError({ message: `${command}: ${error.message}`, missing: error.code === 'ENOENT' }))
        })
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout)
                return
            }
            reject(new CommandError({ message: stderr.trim().length > 0 ? stderr.trim() : `${command} exited with code ${code}`, missing: false }))
        })
    })
}

class CommandError extends Error {
    readonly missing: boolean

    constructor({ message, missing }: { message: string, missing: boolean }) {
        super(message)
        this.missing = missing
    }
}

type RunParams = {
    command: string
    args: string[]
    env: Record<string, string>
    timeoutMs: number
}

type EngineInspection = {
    kind: BackupEngine
    available: boolean
    problem: BackupEngineProblem | null
    clientVersion: string | null
    serverVersion: string | null
}

type ReadableResult = {
    ok: boolean
    verifiedWith: 'gzip' | 'tar' | 'open' | 'header' | 'pg_restore' | null
    detail: string | null
}

export type { EngineInspection, ReadableResult }
