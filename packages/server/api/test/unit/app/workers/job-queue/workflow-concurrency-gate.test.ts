import { describe, expect, it } from 'vitest'
import { ConcurrencyStore, createWorkflowConcurrencyGate } from '../../../../../src/app/workers/job-queue/interceptors/workflow-concurrency-gate'

describe('workflowConcurrencyGate', () => {
    it('admits up to the maximum and lets a queued run in once a slot frees up', async () => {
        const { gate } = setup()
        const ticket = { maxConcurrentRuns: 2, enqueuedAt: 1 }

        expect(await gate.admit({ workflowId: 'wf', jobId: 'a', ticket })).toBe(true)
        expect(await gate.admit({ workflowId: 'wf', jobId: 'b', ticket })).toBe(true)
        expect(await gate.admit({ workflowId: 'wf', jobId: 'c', ticket })).toBe(false)

        await gate.release({ workflowId: 'wf', jobId: 'a', ticket })

        expect(await gate.admit({ workflowId: 'wf', jobId: 'c', ticket })).toBe(true)
    })

    it('re-admits a run that already holds a slot, for example after a worker reconnect', async () => {
        const { gate } = setup()
        const ticket = { maxConcurrentRuns: 1, enqueuedAt: 1 }

        expect(await gate.admit({ workflowId: 'wf', jobId: 'a', ticket })).toBe(true)
        expect(await gate.admit({ workflowId: 'wf', jobId: 'a', ticket })).toBe(true)
    })

    it('keeps limits separate per workflow', async () => {
        const { gate } = setup()
        const ticket = { maxConcurrentRuns: 1, enqueuedAt: 1 }

        expect(await gate.admit({ workflowId: 'wf-1', jobId: 'a', ticket })).toBe(true)
        expect(await gate.admit({ workflowId: 'wf-2', jobId: 'b', ticket })).toBe(true)
    })

    it('runs events with the same order key one at a time in arrival order', async () => {
        const { gate } = setup()
        const first = { maxConcurrentRuns: 0, orderKey: 'user-1', enqueuedAt: 1 }
        const second = { maxConcurrentRuns: 0, orderKey: 'user-1', enqueuedAt: 2 }
        const other = { maxConcurrentRuns: 0, orderKey: 'user-2', enqueuedAt: 3 }
        await gate.enqueue({ workflowId: 'wf', jobId: 'a', ticket: first })
        await gate.enqueue({ workflowId: 'wf', jobId: 'b', ticket: second })

        expect(await gate.admit({ workflowId: 'wf', jobId: 'b', ticket: second })).toBe(false)
        expect(await gate.admit({ workflowId: 'wf', jobId: 'c', ticket: other })).toBe(true)
        expect(await gate.admit({ workflowId: 'wf', jobId: 'a', ticket: first })).toBe(true)
        expect(await gate.admit({ workflowId: 'wf', jobId: 'b', ticket: second })).toBe(false)

        await gate.release({ workflowId: 'wf', jobId: 'a', ticket: first })

        expect(await gate.admit({ workflowId: 'wf', jobId: 'b', ticket: second })).toBe(true)
    })

    it('restores a run to its original place when it is returned to the queue', async () => {
        const { gate } = setup()
        const first = { maxConcurrentRuns: 0, orderKey: 'k', enqueuedAt: 1 }
        const second = { maxConcurrentRuns: 0, orderKey: 'k', enqueuedAt: 2 }
        await gate.enqueue({ workflowId: 'wf', jobId: 'a', ticket: first })
        await gate.enqueue({ workflowId: 'wf', jobId: 'b', ticket: second })
        await gate.release({ workflowId: 'wf', jobId: 'a', ticket: first })

        expect(await gate.admit({ workflowId: 'wf', jobId: 'a', ticket: first })).toBe(true)
        expect(await gate.admit({ workflowId: 'wf', jobId: 'b', ticket: second })).toBe(false)
    })

    it('skips a head whose job no longer exists so the queue cannot get stuck', async () => {
        const { gate } = setup({ deadJobs: ['a'] })
        const first = { maxConcurrentRuns: 0, orderKey: 'k', enqueuedAt: 1 }
        const second = { maxConcurrentRuns: 0, orderKey: 'k', enqueuedAt: 2 }
        await gate.enqueue({ workflowId: 'wf', jobId: 'a', ticket: first })

        expect(await gate.admit({ workflowId: 'wf', jobId: 'b', ticket: second })).toBe(true)
    })

    it('applies both the order key and the workflow limit', async () => {
        const { gate } = setup()
        const a = { maxConcurrentRuns: 1, orderKey: 'x', enqueuedAt: 1 }
        const b = { maxConcurrentRuns: 1, orderKey: 'y', enqueuedAt: 2 }

        expect(await gate.admit({ workflowId: 'wf', jobId: 'a', ticket: a })).toBe(true)
        expect(await gate.admit({ workflowId: 'wf', jobId: 'b', ticket: b })).toBe(false)
    })

    it('frees slots held by runs that exceeded the run timeout', async () => {
        const clock = { now: 1_000 }
        const { gate } = setup({ clock })
        const ticket = { maxConcurrentRuns: 1, enqueuedAt: 1 }

        expect(await gate.admit({ workflowId: 'wf', jobId: 'a', ticket })).toBe(true)
        clock.now += ACTIVE_TTL_MS + 1

        expect(await gate.admit({ workflowId: 'wf', jobId: 'b', ticket })).toBe(true)
    })
})

function setup({ deadJobs = [], clock = { now: 1_000 } }: { deadJobs?: string[], clock?: { now: number } } = {}) {
    const store = memoryStore()
    const gate = createWorkflowConcurrencyGate({
        store,
        withLock: ({ fn }) => fn(),
        isJobAlive: async (jobId) => !deadJobs.includes(jobId),
        now: () => clock.now,
        activeTtlMs: ACTIVE_TTL_MS,
    })
    return { gate, store }
}

function memoryStore(): ConcurrencyStore {
    const sets = new Map<string, Map<string, number>>()
    const setOf = (key: string): Map<string, number> => {
        const existing = sets.get(key)
        if (existing) {
            return existing
        }
        const created = new Map<string, number>()
        sets.set(key, created)
        return created
    }
    return {
        async addToQueue({ key, member, score }) {
            const set = setOf(key)
            if (!set.has(member)) {
                set.set(member, score)
            }
        },
        async queueHead(key) {
            const entries = [...setOf(key).entries()].sort((a, b) => a[1] - b[1])
            return entries[0]?.[0] ?? null
        },
        async removeFromQueue({ key, member }) {
            setOf(key).delete(member)
        },
        async pruneActive({ key, before }) {
            const set = setOf(key)
            for (const [member, score] of set.entries()) {
                if (score <= before) {
                    set.delete(member)
                }
            }
        },
        async isActive({ key, member }) {
            return setOf(key).has(member)
        },
        async activeCount(key) {
            return setOf(key).size
        },
        async markActive({ key, member, score }) {
            setOf(key).set(member, score)
        },
        async removeActive({ key, member }) {
            setOf(key).delete(member)
        },
    }
}

const ACTIVE_TTL_MS = 60_000
