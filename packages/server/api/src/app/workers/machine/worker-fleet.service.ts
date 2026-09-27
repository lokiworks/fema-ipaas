import { ApplicationError, ErrorCode, isNil, parseToJsonIfPossible } from '@fema-ipaas/core-utils'
import { dayjsUtil, versionUtil } from '@fema-ipaas/server-utils'
import { MachineInformation, WORKER_NODE_LIMITS, WorkerFleet, WorkerGroupScope, WorkerNode, WorkerNodeStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { redisConnections } from '../../database/redis-connections'
import { WorkerMachine, workerMachineCache } from './machine-cache'
import { parseWorkerConcurrency, workerCapacity } from './worker-capacity'

const WorkerMachineShape = z.object({
    id: z.string(),
    updated: z.string(),
    created: z.string(),
    information: MachineInformation,
    type: z.enum(['SHARED', 'DEDICATED']).optional(),
    workerGroupId: z.string().optional(),
    workerGroupScope: z.enum(WorkerGroupScope).optional(),
})

export const workerFleetService = (log: FastifyBaseLogger) => ({
    async list(): Promise<WorkerFleet> {
        const redis = await redisConnections.useExisting()
        const [machines, drainedRaw, departedRaw] = await Promise.all([
            workerMachineCache().find(),
            redis.hgetall(DRAINED_KEY),
            redis.hgetall(DEPARTED_KEY),
        ])
        const now = dayjsUtil()
        const departed = Object.values(departedRaw).map(parseMachine).filter((machine): machine is WorkerMachine => !isNil(machine))
        const liveIds = new Set(machines.map((machine) => machine.id))
        const all = [...machines, ...departed.filter((machine) => !liveIds.has(machine.id))]
        const forgotten = all.filter((machine) => now.diff(dayjsUtil(machine.updated), 'hour', true) >= WORKER_NODE_LIMITS.forgetOfflineAfterHours)
        if (forgotten.length > 0) {
            await forget(forgotten.map((machine) => machine.id))
        }
        const appVersion = versionUtil.getCurrentRelease()
        const nodes = all
            .filter((machine) => !forgotten.includes(machine))
            .filter((machine) => machine.workerGroupScope !== WorkerGroupScope.TENANT)
            .map((machine) => toNode({ machine, drainedAt: drainedRaw[machine.id] ?? null, departed: !liveIds.has(machine.id), appVersion, now: now.toISOString() }))
            .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
        return { appVersion, nodes }
    },

    async drain({ workerId }: WorkerParams): Promise<void> {
        const machine = await workerMachineCache().findOne(workerId)
        if (isNil(machine) || isStale(machine.updated)) {
            throw validation('Only an online worker can be drained')
        }
        const redis = await redisConnections.useExisting()
        await redis.hset(DRAINED_KEY, workerId, dayjsUtil().toISOString())
        await workerCapacity.invalidate()
        log.info({ worker: { id: workerId } }, '[workerFleet] worker drained')
    },

    async resume({ workerId }: WorkerParams): Promise<void> {
        const redis = await redisConnections.useExisting()
        await redis.hdel(DRAINED_KEY, workerId)
        await workerCapacity.invalidate()
        log.info({ worker: { id: workerId } }, '[workerFleet] worker resumed')
    },

    async remove({ workerId }: WorkerParams): Promise<void> {
        const machine = await workerMachineCache().findOne(workerId)
        if (!isNil(machine) && !isStale(machine.updated)) {
            throw validation('Stop the worker before removing it; a running worker reappears on its next heartbeat')
        }
        await forget([workerId])
        log.info({ worker: { id: workerId } }, '[workerFleet] worker removed')
    },

    async isDrained({ workerId }: WorkerParams): Promise<boolean> {
        const redis = await redisConnections.useExisting()
        return (await redis.hexists(DRAINED_KEY, workerId)) === 1
    },

    async rememberDepartures({ machines }: { machines: WorkerMachine[] }): Promise<void> {
        if (machines.length === 0) {
            return
        }
        const redis = await redisConnections.useExisting()
        await redis.hset(DEPARTED_KEY, Object.fromEntries(machines.map((machine) => [machine.id, JSON.stringify(machine)])))
    },
})

function toNode({ machine, drainedAt, departed, appVersion, now }: ToNodeParams): WorkerNode {
    const offline = departed || isStale(machine.updated, now)
    const status = offline ? WorkerNodeStatus.OFFLINE : isNil(drainedAt) ? WorkerNodeStatus.ONLINE : WorkerNodeStatus.DRAINING
    const info = machine.information
    const version = info.workerProps.version ?? null
    return {
        id: machine.id,
        status,
        ip: info.ip,
        version,
        versionMatchesApp: !isNil(version) && versionUtil.versionsAreCompatible({ versionA: version, versionB: appVersion }),
        labels: parseLabels(info.workerProps.LABELS),
        concurrency: parseWorkerConcurrency(info.workerProps.WORKER_CONCURRENCY),
        cpuUsagePercentage: offline ? null : info.cpuUsagePercentage,
        ramUsagePercentage: offline ? null : info.ramUsagePercentage,
        busySandboxes: offline ? 0 : (info.sandboxes ?? []).filter((sandbox) => sandbox.busy).length,
        workerGroupId: machine.workerGroupId ?? null,
        connectedAt: machine.created,
        lastHeartbeatAt: machine.updated,
        drainedAt,
    }
}

function isStale(updated: string, now?: string): boolean {
    return dayjsUtil(now).diff(dayjsUtil(updated), 'second', true) > WORKER_NODE_LIMITS.offlineAfterSeconds
}

async function forget(ids: string[]): Promise<void> {
    if (ids.length === 0) {
        return
    }
    const redis = await redisConnections.useExisting()
    await Promise.all([
        workerMachineCache().delete(ids),
        redis.hdel(DEPARTED_KEY, ...ids),
        redis.hdel(DRAINED_KEY, ...ids),
    ])
}

function parseMachine(raw: string): WorkerMachine | null {
    const parsed: unknown = parseToJsonIfPossible(raw)
    if (typeof parsed !== 'object' || isNil(parsed) || !('id' in parsed) || !('information' in parsed) || !('updated' in parsed)) {
        return null
    }
    const { data, success } = WorkerMachineShape.safeParse(parsed)
    return success ? data : null
}

function validation(message: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

function parseLabels(raw: string | undefined): string[] {
    if (isNil(raw)) {
        return []
    }
    const labels = raw.split(/[\s,]+/).map((label) => label.trim().toLowerCase()).filter((label) => label.length > 0)
    return [...new Set(labels)].slice(0, WORKER_NODE_LIMITS.maxLabels)
}

const DRAINED_KEY = 'workerMachines:drained'
const DEPARTED_KEY = 'workerMachines:departed'
const STATUS_ORDER = [WorkerNodeStatus.ONLINE, WorkerNodeStatus.DRAINING, WorkerNodeStatus.OFFLINE]

export const workerFleetUtils = {
    parseLabels,
    isStale,
}

type WorkerParams = {
    workerId: string
}

type ToNodeParams = {
    machine: WorkerMachine
    drainedAt: string | null
    departed: boolean
    appVersion: string
    now: string
}
