import { DateOrString, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'

export enum WorkerNodeStatus {
    ONLINE = 'ONLINE',
    DRAINING = 'DRAINING',
    OFFLINE = 'OFFLINE',
}

export const WorkerNode = z.object({
    id: z.string(),
    status: z.enum(WorkerNodeStatus),
    ip: z.string(),
    version: Nullable(z.string()),
    versionMatchesApp: z.boolean(),
    labels: z.array(z.string()),
    concurrency: z.number(),
    cpuUsagePercentage: Nullable(z.number()),
    ramUsagePercentage: Nullable(z.number()),
    busySandboxes: z.number(),
    workerGroupId: Nullable(z.string()),
    connectedAt: DateOrString,
    lastHeartbeatAt: DateOrString,
    drainedAt: Nullable(DateOrString),
})
export type WorkerNode = z.infer<typeof WorkerNode>

export const WorkerFleet = z.object({
    appVersion: z.string(),
    nodes: z.array(WorkerNode),
})
export type WorkerFleet = z.infer<typeof WorkerFleet>

export const WORKER_NODE_LIMITS = {
    maxLabels: 5,
    minConcurrency: 1,
    maxConcurrency: 100,
    offlineAfterSeconds: 60,
    forgetOfflineAfterHours: 24,
}
