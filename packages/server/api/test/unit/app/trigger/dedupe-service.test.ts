import { ScheduleOverlapPolicy } from '@fema-ipaas/shared'
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
        const first = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ body: { order_no: 'A-1' } }] })
        expect(first.accepted).toHaveLength(1)
        const claim = first.accepted[0].claim
        expect(claim).not.toBeNull()
        await dedupeService.bindFirstExecution({ claim: claim!, executionId: 'run-1' })

        const second = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ body: { order_no: 'A-1' } }, { body: { order_no: 'A-2' } }] })

        expect(second.accepted.map((item) => item.payload)).toEqual([{ body: { order_no: 'A-2' } }])
        expect(second.duplicates).toEqual([{ payload: { body: { order_no: 'A-1' } }, keyHash: dedupeKeyUtils.hashKey('A-1'), keyPreview: 'A-1', firstExecutionId: 'run-1' }])
    })

    it('processes the event again once the window has passed', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 1 }] })
        fakeRedis.advance(HOUR * 1000 + 1)

        const again = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings, payloads: [{ id: 1 }] })

        expect(again.accepted).toHaveLength(1)
        expect(fakeRedis.lastExpirySeconds()).toBe(HOUR)
    })

    it('keeps the same key separate per workflow and ignores events without a key', async () => {
        const settings = { enabled: true, keyPath: 'id', windowSeconds: HOUR }
        await dedupeService.claimWorkflowDedupe({ workflowId: 'wf-1', settings, payloads: [{ id: 1 }] })

        const other = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf-2', settings, payloads: [{ id: 1 }, { name: 'no key' }] })

        expect(other.accepted).toHaveLength(2)
        expect(other.accepted[1].claim).toBeNull()
    })

    it('treats markers written by the previous implementation as duplicates', async () => {
        await fakeRedis.set('workflow-dedupe:wf:A-1', '1', 'EX', HOUR, 'NX')

        const result = await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings: { enabled: true, keyPath: 'no', windowSeconds: HOUR }, payloads: [{ no: 'A-1' }] })

        expect(result.duplicates).toHaveLength(1)
        expect(result.duplicates[0].firstExecutionId).toBeNull()
    })

    it('does nothing when dedupe is off or the key references another step', async () => {
        const payloads = [{ id: 1 }, { id: 1 }]
        expect((await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings: undefined, payloads })).accepted).toHaveLength(2)
        expect((await dedupeService.claimWorkflowDedupe({ workflowId: 'wf', settings: { enabled: true, keyPath: '{{step_1.id}}', windowSeconds: HOUR }, payloads })).accepted).toHaveLength(2)
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
        async eval(_script: string, _keys: number, key: string, value: string) {
            const entry = live(key)
            if (entry) {
                values.set(key, { value, expiresAt: entry.expiresAt })
            }
            return entry ? entry.expiresAt - now : -2
        },
    }
}

const HOUR = 60 * 60
const baseExecution = {
    projectId: 'p',
    workflowId: 'wf',
    workflowVersionId: 'v',
    environment: 'PRODUCTION',
    status: 'QUEUED',
    created: '',
    updated: '',
    tags: [],
    steps: {},
}
