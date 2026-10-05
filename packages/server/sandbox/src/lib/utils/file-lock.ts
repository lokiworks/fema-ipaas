import { mkdir, rename, rm, stat, utimes } from 'node:fs/promises'
import path from 'node:path'
import { isNil, tryCatch } from '@fema-ipaas/core-utils'

const POLL_INTERVAL_MS = 100
const HEARTBEAT_INTERVAL_MS = 2_000
const STALE_AFTER_MS = 20_000
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

async function runExclusive<T>({ lockPath, fn, timeoutMs = DEFAULT_TIMEOUT_MS }: RunExclusiveParams<T>): Promise<T> {
    await acquire({ lockPath, timeoutMs })
    const heartbeat = setInterval(() => {
        const now = new Date()
        void tryCatch(() => utimes(lockPath, now, now))
    }, HEARTBEAT_INTERVAL_MS)
    heartbeat.unref()
    try {
        return await fn()
    }
    finally {
        clearInterval(heartbeat)
        await tryCatch(() => rm(lockPath, { recursive: true, force: true }))
    }
}

async function acquire({ lockPath, timeoutMs }: { lockPath: string, timeoutMs: number }): Promise<void> {
    await mkdir(path.dirname(lockPath), { recursive: true })
    const deadline = Date.now() + timeoutMs
    for (;;) {
        const { error } = await tryCatch(() => mkdir(lockPath))
        if (isNil(error)) {
            return
        }
        if (!('code' in error) || error.code !== 'EEXIST') {
            throw error
        }
        await removeIfStale({ lockPath })
        if (Date.now() > deadline) {
            throw new Error(`Timed out after ${timeoutMs} ms waiting for the lock ${lockPath}`)
        }
        await sleep({ ms: POLL_INTERVAL_MS })
    }
}

async function removeIfStale({ lockPath }: { lockPath: string }): Promise<void> {
    const { data, error } = await tryCatch(() => stat(lockPath))
    if (!isNil(error) || isNil(data) || Date.now() - data.mtimeMs <= STALE_AFTER_MS) {
        return
    }
    const parked = `${lockPath}.stale-${process.pid}-${Date.now()}`
    const { error: renameError } = await tryCatch(() => rename(lockPath, parked))
    if (isNil(renameError)) {
        await tryCatch(() => rm(parked, { recursive: true, force: true }))
    }
}

function sleep({ ms }: { ms: number }): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export const fileLock = {
    runExclusive,
}

type RunExclusiveParams<T> = {
    lockPath: string
    fn: () => Promise<T>
    timeoutMs?: number
}
