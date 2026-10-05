import { isNil, ProjectId, tryCatch, WorkflowId } from '@fema-ipaas/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { IsNull, Like } from 'typeorm'
import { distributedLock } from '../database/redis-connections'
import { storeEntryRepo, storeEntryService } from '../store-entry/store-entry.service'

export const pollCursorGuard = (log: FastifyBaseLogger) => ({
    async begin({ projectId, workflowId, jobId }: PollParams): Promise<void> {
        await withLock({ log, workflowId, fn: async () => {
            const existing = await readSnapshot({ projectId, workflowId })
            if (!isNil(existing) && existing.jobId !== jobId && Date.now() - existing.startedAt < IN_FLIGHT_WINDOW_MS) {
                return
            }
            if (!isNil(existing)) {
                await restore({ projectId, workflowId, snapshot: existing })
                log.warn({ workflow: { id: workflowId }, job: { id: jobId }, previousJob: { id: existing.jobId } }, '[pollCursorGuard#begin] Previous poll never committed, its trigger state was rolled back so the events it fetched are fetched again')
            }
            const entries = await currentEntries({ projectId, workflowId })
            if (Object.keys(entries).length === 0) {
                return
            }
            await writeSnapshot({ projectId, workflowId, snapshot: { jobId, startedAt: Date.now(), phase: SnapshotPhase.POLLING, entries } })
        } })
    },

    async markSubmitting({ projectId, workflowId }: WorkflowParams): Promise<void> {
        if (isNil(await readSnapshot({ projectId, workflowId }))) {
            return
        }
        await withLock({ log, workflowId, fn: async () => {
            const existing = await readSnapshot({ projectId, workflowId })
            if (isNil(existing)) {
                return
            }
            await writeSnapshot({ projectId, workflowId, snapshot: { ...existing, phase: SnapshotPhase.SUBMITTING } })
        } })
    },

    async commit({ projectId, workflowId }: WorkflowParams): Promise<void> {
        if (isNil(await readSnapshot({ projectId, workflowId }))) {
            return
        }
        await withLock({ log, workflowId, fn: async () => {
            await deleteSnapshot({ projectId, workflowId })
        } })
    },

    async settle({ projectId, workflowId, jobId, failed }: SettleParams): Promise<void> {
        await withLock({ log, workflowId, fn: async () => {
            const existing = await readSnapshot({ projectId, workflowId })
            if (isNil(existing) || existing.jobId !== jobId) {
                return
            }
            const submissionLeftOpen = existing.phase === SnapshotPhase.SUBMITTING
            if (failed || submissionLeftOpen) {
                await restore({ projectId, workflowId, snapshot: existing })
                log.warn({ workflow: { id: workflowId }, job: { id: jobId }, failed, submissionLeftOpen }, '[pollCursorGuard#settle] Poll did not hand its events over, trigger state rolled back so they are fetched again')
                return
            }
            await deleteSnapshot({ projectId, workflowId })
        } })
    },

    async discard({ projectId, workflowId }: WorkflowParams): Promise<void> {
        await withLock({ log, workflowId, fn: async () => {
            await deleteSnapshot({ projectId, workflowId })
        } })
    },
})

async function withLock<T>({ log, workflowId, fn }: { log: FastifyBaseLogger, workflowId: WorkflowId, fn: () => Promise<T> }): Promise<T> {
    return distributedLock(log).runExclusive({ key: `poll-cursor:${workflowId}`, timeoutInSeconds: LOCK_TIMEOUT_SECONDS, fn })
}

async function currentEntries({ projectId, workflowId }: WorkflowParams): Promise<Record<string, unknown>> {
    const rows = await storeEntryRepo().find({
        where: { projectId, dataStoreId: IsNull(), key: Like(`${escapeLike({ text: triggerStorePrefix({ workflowId }) })}%`) },
        select: ['key', 'value'],
    })
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

async function restore({ projectId, workflowId, snapshot }: { projectId: ProjectId, workflowId: WorkflowId, snapshot: PollSnapshot }): Promise<void> {
    const current = await currentEntries({ projectId, workflowId })
    const stale = Object.keys(current).filter((key) => !(key in snapshot.entries))
    await Promise.all(stale.map((key) => storeEntryService.delete({ projectId, key })))
    await Promise.all(Object.entries(snapshot.entries).map(([key, value]) => storeEntryService.upsert({ projectId, request: { key, value } })))
    await deleteSnapshot({ projectId, workflowId })
}

async function readSnapshot({ projectId, workflowId }: WorkflowParams): Promise<PollSnapshot | null> {
    const entry = await storeEntryService.getOne({ projectId, key: snapshotKey({ workflowId }) })
    if (isNil(entry)) {
        return null
    }
    const { data } = await tryCatch(async () => parseSnapshot({ value: entry.value }))
    return data ?? null
}

async function writeSnapshot({ projectId, workflowId, snapshot }: { projectId: ProjectId, workflowId: WorkflowId, snapshot: PollSnapshot }): Promise<void> {
    await storeEntryService.upsert({ projectId, request: { key: snapshotKey({ workflowId }), value: snapshot } })
}

async function deleteSnapshot({ projectId, workflowId }: WorkflowParams): Promise<void> {
    await storeEntryService.delete({ projectId, key: snapshotKey({ workflowId }) })
}

function parseSnapshot({ value }: { value: unknown }): PollSnapshot {
    if (typeof value !== 'object' || value === null || !('jobId' in value) || !('startedAt' in value) || !('phase' in value) || !('entries' in value)) {
        throw new Error('poll snapshot is malformed')
    }
    const { jobId, startedAt, phase, entries } = value
    if (typeof jobId !== 'string' || typeof startedAt !== 'number' || typeof entries !== 'object' || entries === null) {
        throw new Error('poll snapshot is malformed')
    }
    return {
        jobId,
        startedAt,
        phase: phase === SnapshotPhase.SUBMITTING ? SnapshotPhase.SUBMITTING : SnapshotPhase.POLLING,
        entries: Object.fromEntries(Object.entries(entries)),
    }
}

function snapshotKey({ workflowId }: { workflowId: WorkflowId }): string {
    return `${SNAPSHOT_KEY_PREFIX}${workflowId}`
}

function triggerStorePrefix({ workflowId }: { workflowId: WorkflowId }): string {
    return `workflow_${workflowId}/`
}

function escapeLike({ text }: { text: string }): string {
    return text.replace(/[\\%_]/g, (char) => `\\${char}`)
}

const SNAPSHOT_KEY_PREFIX = 'poll-snapshot/'
const IN_FLIGHT_WINDOW_MS = 3 * 60 * 1000
const LOCK_TIMEOUT_SECONDS = 20

enum SnapshotPhase {
    POLLING = 'POLLING',
    SUBMITTING = 'SUBMITTING',
}

type PollSnapshot = {
    jobId: string
    startedAt: number
    phase: SnapshotPhase
    entries: Record<string, unknown>
}

type WorkflowParams = {
    projectId: ProjectId
    workflowId: WorkflowId
}

type PollParams = WorkflowParams & {
    jobId: string
}

type SettleParams = PollParams & {
    failed: boolean
}
