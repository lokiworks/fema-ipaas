import { randomUUID } from 'node:crypto'
import { mkdir, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fileLock } from '../../../src/lib/utils/file-lock'

const folders: string[] = []

function uniqueLockPath(): string {
    const folder = join(tmpdir(), `file-lock-test-${randomUUID()}`)
    folders.push(folder)
    return join(folder, 'step.lock')
}

function sleep({ ms }: { ms: number }): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

afterEach(async () => {
    await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

describe('fileLock.runExclusive', () => {
    it('never lets two holders run at once, the way two worker processes sharing a cache directory would', async () => {
        const lockPath = uniqueLockPath()
        const state = { running: 0, peak: 0, finished: 0 }
        await Promise.all(Array.from({ length: 6 }, () => fileLock.runExclusive({
            lockPath,
            fn: async () => {
                state.running += 1
                state.peak = Math.max(state.peak, state.running)
                await sleep({ ms: 30 })
                state.running -= 1
                state.finished += 1
            },
        })))
        expect(state.peak).toBe(1)
        expect(state.finished).toBe(6)
    })

    it('releases the lock when the work throws', async () => {
        const lockPath = uniqueLockPath()
        await expect(fileLock.runExclusive({ lockPath, fn: async () => { throw new Error('boom') } })).rejects.toThrow('boom')
        await expect(fileLock.runExclusive({ lockPath, fn: async () => 'next', timeoutMs: 1000 })).resolves.toBe('next')
    })

    it('takes over a lock whose owner died without releasing it', async () => {
        const lockPath = uniqueLockPath()
        await mkdir(lockPath, { recursive: true })
        const longAgo = new Date(Date.now() - 60_000)
        await utimes(lockPath, longAgo, longAgo)
        await expect(fileLock.runExclusive({ lockPath, fn: async () => 'taken', timeoutMs: 5000 })).resolves.toBe('taken')
    })

    it('gives up with a clear error when a live holder keeps the lock past the timeout', async () => {
        const lockPath = uniqueLockPath()
        const holder = fileLock.runExclusive({ lockPath, fn: () => sleep({ ms: 600 }) })
        await sleep({ ms: 50 })
        await expect(fileLock.runExclusive({ lockPath, fn: async () => 'never', timeoutMs: 200 })).rejects.toThrow('Timed out')
        await holder
    })
})
