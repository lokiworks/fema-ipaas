import { createHash } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { RunConcurrencyTicket } from '@fema-ipaas/shared'

export function createWorkflowConcurrencyGate({ store, withLock, isJobAlive, now, activeTtlMs }: GateDependencies): WorkflowConcurrencyGate {
    return {
        async enqueue({ workflowId, jobId, ticket }) {
            if (isNil(ticket.orderKey)) {
                return
            }
            await store.addToQueue({ key: gateKeys.order({ workflowId, orderKey: ticket.orderKey }), member: jobId, score: ticket.enqueuedAt })
        },
        async admit({ workflowId, jobId, ticket }) {
            return withLock({
                key: gateKeys.lock(workflowId),
                fn: async () => {
                    if (!isNil(ticket.orderKey)) {
                        const orderKey = gateKeys.order({ workflowId, orderKey: ticket.orderKey })
                        await store.addToQueue({ key: orderKey, member: jobId, score: ticket.enqueuedAt })
                        const head = await liveQueueHead({ store, isJobAlive, key: orderKey, self: jobId })
                        if (head !== jobId) {
                            return false
                        }
                    }
                    if (ticket.maxConcurrentRuns <= 0) {
                        return true
                    }
                    const activeKey = gateKeys.active(workflowId)
                    const timestamp = now()
                    await store.pruneActive({ key: activeKey, before: timestamp - activeTtlMs })
                    if (await store.isActive({ key: activeKey, member: jobId })) {
                        return true
                    }
                    if (await store.activeCount(activeKey) >= ticket.maxConcurrentRuns) {
                        return false
                    }
                    await store.markActive({ key: activeKey, member: jobId, score: timestamp })
                    return true
                },
            })
        },
        async release({ workflowId, jobId, ticket }) {
            await store.removeActive({ key: gateKeys.active(workflowId), member: jobId })
            if (!isNil(ticket.orderKey)) {
                await store.removeFromQueue({ key: gateKeys.order({ workflowId, orderKey: ticket.orderKey }), member: jobId })
            }
        },
    }
}

export const gateKeys = {
    lock: (workflowId: string): string => `workflow-concurrency:v1:${workflowId}:lock`,
    active: (workflowId: string): string => `workflow-concurrency:v1:${workflowId}:active`,
    order: ({ workflowId, orderKey }: { workflowId: string, orderKey: string }): string => `workflow-concurrency:v1:${workflowId}:order:${createHash('sha256').update(orderKey).digest('hex')}`,
}

async function liveQueueHead({ store, isJobAlive, key, self }: LiveQueueHeadParams): Promise<string | null> {
    for (let attempt = 0; attempt < MAX_STALE_HEADS_PER_CHECK; attempt++) {
        const head = await store.queueHead(key)
        if (isNil(head) || head === self) {
            return head
        }
        if (await isJobAlive(head)) {
            return head
        }
        await store.removeFromQueue({ key, member: head })
    }
    return store.queueHead(key)
}

const MAX_STALE_HEADS_PER_CHECK = 5

type LiveQueueHeadParams = {
    store: ConcurrencyStore
    isJobAlive: (jobId: string) => Promise<boolean>
    key: string
    self: string
}

type GateCall = {
    workflowId: string
    jobId: string
    ticket: RunConcurrencyTicket
}

export type WorkflowConcurrencyGate = {
    enqueue(params: GateCall): Promise<void>
    admit(params: GateCall): Promise<boolean>
    release(params: GateCall): Promise<void>
}

export type ConcurrencyStore = {
    addToQueue(params: { key: string, member: string, score: number }): Promise<void>
    queueHead(key: string): Promise<string | null>
    removeFromQueue(params: { key: string, member: string }): Promise<void>
    pruneActive(params: { key: string, before: number }): Promise<void>
    isActive(params: { key: string, member: string }): Promise<boolean>
    activeCount(key: string): Promise<number>
    markActive(params: { key: string, member: string, score: number }): Promise<void>
    removeActive(params: { key: string, member: string }): Promise<void>
}

export type GateDependencies = {
    store: ConcurrencyStore
    withLock: <T>(params: { key: string, fn: () => Promise<T> }) => Promise<T>
    isJobAlive: (jobId: string) => Promise<boolean>
    now: () => number
    activeTtlMs: number
}
