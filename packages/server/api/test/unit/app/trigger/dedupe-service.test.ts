import { ExecutionStatus, RunEnvironment, ScheduleOverlapPolicy } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fakeRedis = createFakeRedis()

vi.mock('../../../../src/app/database/redis-connections', () => ({
    redisConnections: { useExisting: async () => fakeRedis },
}))

import { dedupeKeyUtils, dedupeService } from '../../../../src/app/trigger/dedupe-service'
import { triggerRunPolicyUtils } from '../../../../src/app/trigger/trigger-run-policy-utils'

describe('dedupeService.claimWorkflowDedupe', () => {
    beforeEach(() => {
        fakeRedis.reset()
    })

    it('accepts the first event and records later ones inside the window as duplicates of it', async () => {
        const settings = { enabled: true, keyPath: 'body.order_no', windowSeconds: HOUR }
        const first = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ body: { order_no: 'A-1' } }], findFailedExecutionIds: noFailedRuns })
        expect(first.accepted).toHaveLength(1)
        const claim = first.accepted[0].claim
        expect(claim).not.toBeNull()
        await dedupeService.bindFirstExecution({ claim: claim!, executionId: 'run-1' })

        const second = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ body: { order_no: 'A-1' } }, { body: { order_no: 'A-2' } }], findFailedExecutionIds: noFailedRuns })

        expect(second.accepted.map((item) => item.payload)).toEqual([{ body: { order_no: 'A-2' } }])
        expect(second.duplicates).toEqual([{ payload: { body: { order_no: 'A-1' } }, keyHash: dedupeKeyUtils.hashKey('A-1'), keyPreview: 'A-1', firstExecutionId: 'run-1' }])
    })

    it('processes the event again once the window has passed', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 1 }], findFailedExecutionIds: noFailedRuns })
        fakeRedis.advance(HOUR * 1000 + 1)

        const again = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 1 }], findFailedExecutionIds: noFailedRuns })

        expect(again.accepted).toHaveLength(1)
        expect(fakeRedis.lastExpirySeconds()).toBe(HOUR)
    })

    it('frees a claim whose run never started so the next fetch of the same event can start it', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        const first = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 7 }], findFailedExecutionIds: noFailedRuns })
        await dedupeService.releaseClaim({ claim: first.accepted[0].claim! })

        const again = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 7 }], findFailedExecutionIds: noFailedRuns })

        expect(again.accepted).toHaveLength(1)
        expect(again.duplicates).toHaveLength(0)
    })

    it('does not free a claim that already belongs to a started run', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        const first = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 8 }], findFailedExecutionIds: noFailedRuns })
        await dedupeService.bindFirstExecution({ claim: first.accepted[0].claim!, executionId: 'run-8' })
        await dedupeService.releaseClaim({ claim: first.accepted[0].claim! })

        const again = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 8 }], findFailedExecutionIds: noFailedRuns })

        expect(again.accepted).toHaveLength(0)
        expect(again.duplicates[0].firstExecutionId).toBe('run-8')
    })

    it('takes over a claim that stayed pending long after its owner died, but not a fresh one', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 9 }], findFailedExecutionIds: noFailedRuns })
        fakeRedis.advance(30 * 1000)
        const fresh = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 9 }], findFailedExecutionIds: noFailedRuns })
        expect(fresh.accepted).toHaveLength(0)

        fakeRedis.advance(3 * 60 * 1000)
        const stale = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 9 }], findFailedExecutionIds: noFailedRuns })

        expect(stale.accepted).toHaveLength(1)
        expect(stale.duplicates).toHaveLength(0)
    })

    it('keeps the same key separate per workflow and ignores events without a key', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        await dedupeService.claimWorkflowDedupe({ workflowId: 'wf-1', settings, payloads: [{ id: 1 }], findFailedExecutionIds: noFailedRuns })

        const other = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf-2', settings, payloads: [{ id: 1 }, { name: 'no key' }], findFailedExecutionIds: noFailedRuns })

        expect(other.accepted).toHaveLength(2)
        expect(other.accepted[1].claim).toBeNull()
    })

    it('treats markers written by the previous implementation as duplicates', async () => {
        await fakeRedis.set('workflow-dedupe:wf:A-1', '1', 'EX', HOUR, 'NX')

        const result = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings: { enabled: true, keyPath: 'no', windowSeconds: HOUR }, payloads: [{ no: 'A-1' }], findFailedExecutionIds: noFailedRuns })

        expect(result.duplicates).toHaveLength(1)
        expect(result.duplicates[0].firstExecutionId).toBeNull()
    })

    it('lets a resent event run again when the run of the first one failed', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        const first = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 11 }], findFailedExecutionIds: noFailedRuns })
        await dedupeService.bindFirstExecution({ claim: first.accepted[0].claim!, executionId: 'run-11' })
        const lookups: string[][] = []
        const failedRuns = async ({ executionIds }: { executionIds: string[] }) => {
            lookups.push(executionIds)
            return executionIds.filter((id) => id === 'run-11')
        }

        const resent = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 11 }, { id: 11 }], findFailedExecutionIds: failedRuns })

        expect(lookups).toEqual([['run-11']])
        expect(resent.accepted).toHaveLength(1)
        expect(resent.duplicates).toHaveLength(1)
        expect(resent.duplicates[0].firstExecutionId).toBeNull()
        await dedupeService.bindFirstExecution({ claim: resent.accepted[0].claim!, executionId: 'run-12' })

        const third = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 11 }], findFailedExecutionIds: failedRuns })

        expect(third.accepted).toHaveLength(0)
        expect(third.duplicates[0].firstExecutionId).toBe('run-12')
    })

    it('keeps blocking a resent event while the first run is still going or has succeeded', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        const first = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 13 }], findFailedExecutionIds: noFailedRuns })
        await dedupeService.bindFirstExecution({ claim: first.accepted[0].claim!, executionId: 'run-13' })

        const resent = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 13 }], findFailedExecutionIds: noFailedRuns })

        expect(resent.accepted).toHaveLength(0)
        expect(resent.duplicates[0].firstExecutionId).toBe('run-13')
    })

    it('lets only one server reclaim the key of a failed run', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        const first = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 14 }], findFailedExecutionIds: noFailedRuns })
        await dedupeService.bindFirstExecution({ claim: first.accepted[0].claim!, executionId: 'run-14' })
        const failedRuns = async ({ executionIds }: { executionIds: string[] }) => executionIds

        const [serverA, serverB] = await Promise.all([
            dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 14 }], findFailedExecutionIds: failedRuns }),
            dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 14 }], findFailedExecutionIds: failedRuns }),
        ])

        expect(serverA.accepted.length + serverB.accepted.length).toBe(1)
        expect(serverA.duplicates.length + serverB.duplicates.length).toBe(1)
    })

    it('does nothing when dedupe is off or the key references another step', async () => {
        const payloads = [{ id: 1 }, { id: 1 }]
        expect((await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings: undefined, payloads, findFailedExecutionIds: noFailedRuns })).accepted).toHaveLength(2)
        expect((await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings: { enabled: true, keyPath: '{{step_1.id}}', windowSeconds: HOUR }, payloads, findFailedExecutionIds: noFailedRuns })).accepted).toHaveLength(2)
    })
})

describe('trigger run policy helpers', () => {
    it('truncates long key previews', () => {
        expect(dedupeKeyUtils.previewKey('x'.repeat(250))).toHaveLength(201)
    })

    it('links an in-batch duplicate to the run started for the same key', () => {
        const started = [{ execution: { id: 'run-9' }, claim: { redisKey: 'k', keyHash: 'h' } }]
        const duplicate = { payload: {}, keyHash: 'h', keyPreview: 'x', firstExecutionId: null }
        expect(triggerRunPolicyUtils.firstExecutionIdOf({ duplicate, started: started.map((item) => ({ ...item, execution: { ...baseExecution, ...item.execution } })) })).toBe('run-9')
    })

    it('builds a concurrency ticket only when the trigger limits runs', () => {
        const base = { connectorName: '@fema-ipaas/connector-webhook', connectorVersion: '1.0.0', input: {}, propertySettings: {} }
        expect(triggerRunPolicyUtils.ticketFor({ settings: base, payload: {}, enqueuedAt: 5 })).toBeUndefined()
        expect(triggerRunPolicyUtils.ticketFor({ settings: { ...base, concurrency: { maxConcurrentRuns: 3, orderKeyPath: 'body.user' } }, payload: { body: { user: 'u1' } }, enqueuedAt: 5 }))
            .toEqual({ maxConcurrentRuns: 3, orderKey: 'u1', enqueuedAt: 5 })
        expect(triggerRunPolicyUtils.ticketFor({ settings: { ...base, connectorName: '@fema-ipaas/connector-schedule', scheduleOverlap: ScheduleOverlapPolicy.QUEUE }, payload: {}, enqueuedAt: 5 }))
            .toEqual({ maxConcurrentRuns: 1, enqueuedAt: 5 })
    })
})

function createFakeRedis() {
    const values = new Map<string, { value: string, expiresAt: number }>()
    let now = 0
    let lastExpiry = 0
    const live = (key: string) => {
        const entry = values.get(key)
        if (entry && entry.expiresAt <= now) {
            values.delete(key)
            return undefined
        }
        return entry
    }
    return {
        reset() {
            values.clear()
            now = 0
        },
        advance(ms: number) {
            now += ms
        },
        lastExpirySeconds() {
            return lastExpiry
        },
        async set(key: string, value: string, _ex: 'EX', seconds: number, _nx: 'NX') {
            if (live(key)) {
                return null
            }
            lastExpiry = seconds
            values.set(key, { value, expiresAt: now + seconds * 1000 })
            return 'OK'
        },
        async get(key: string) {
            return live(key)?.value ?? null
        },
        async exists(key: string) {
            return live(key) ? 1 : 0
        },
        async eval(script: string, _keys: number, key: string, ...args: (string | number)[]) {
            const entry = live(key)
            if (script.includes('ARGV[2], \'PX\', ARGV[3]')) {
                const [expected, replacement, ttlMs] = args
                if (entry?.value !== expected) {
                    return 0
                }
                values.set(key, { value: String(replacement), expiresAt: now + Number(ttlMs) })
                return 1
            }
            const [value, windowMs, staleMs] = args
            if (script.includes('DEL')) {
                if (entry?.value === value) {
                    values.delete(key)
                    return 1
                }
                return 0
            }
            if (script.includes('tonumber(ARGV[2])')) {
                if (entry?.value !== value) {
                    return 0
                }
                const age = Number(windowMs) - (entry.expiresAt - now)
                if (age < Number(staleMs)) {
                    return 0
                }
                values.set(key, { value: String(value), expiresAt: now + Number(windowMs) })
                return 1
            }
            if (entry) {
                values.set(key, { value: String(value), expiresAt: entry.expiresAt })
            }
            return entry ? entry.expiresAt - now : -2
        },
    }
}

async function noFailedRuns(): Promise<string[]> {
    return []
}

const HOUR = 60 * 60
const baseExecution = {
    projectId: 'p',
    workflowId: 'wf',
    workflowVersionId: 'v',
    environment: RunEnvironment.PRODUCTION,
    status: ExecutionStatus.QUEUED,
    created: '',
    updated: '',
    tags: [],
    steps: {},
    failParentOnFailure: false,
}
