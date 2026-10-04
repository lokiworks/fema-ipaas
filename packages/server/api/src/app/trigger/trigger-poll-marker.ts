import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { dayjsDuration } from '@fema-ipaas/server-utils'
import { z } from 'zod'
import { redisConnections } from '../database/redis-connections'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

export const triggerPollMarker = {
    touch,
    clear,
    recordSuccess,
    gapOf,
}

async function touch({ workflowId, intervalMs }: { workflowId: string, intervalMs: number }): Promise<void> {
    await write({ workflowId, marker: { at: Date.now(), intervalMs } })
}

async function clear({ workflowId }: { workflowId: string }): Promise<void> {
    const redis = await redisConnections.useExisting()
    await redis.del(keyOf({ workflowId }))
}

async function recordSuccess({ workflowId }: { workflowId: string }): Promise<void> {
    const existing = await read({ workflowId })
    await write({ workflowId, marker: { intervalMs: existing?.intervalMs ?? defaultIntervalMs(), at: Date.now() } })
}

async function gapOf({ workflowId }: { workflowId: string }): Promise<PollGap | null> {
    const marker = await read({ workflowId })
    if (isNil(marker)) {
        return null
    }
    const gapSeconds = Math.round((Date.now() - marker.at) / MS_PER_SECOND)
    const thresholdSeconds = Math.round(marker.intervalMs / MS_PER_SECOND) * MISSED_POLLS_TO_COUNT_AS_GAP + GRACE_SECONDS
    return { gapSeconds, caughtUp: gapSeconds > thresholdSeconds }
}

async function read({ workflowId }: { workflowId: string }): Promise<PollMarker | null> {
    const redis = await redisConnections.useExisting()
    const raw = await redis.get(keyOf({ workflowId }))
    if (isNil(raw)) {
        return null
    }
    const { data } = await tryCatch(async () => PollMarker.parse(JSON.parse(raw)))
    return data ?? null
}

async function write({ workflowId, marker }: { workflowId: string, marker: PollMarker }): Promise<void> {
    const redis = await redisConnections.useExisting()
    await redis.set(keyOf({ workflowId }), JSON.stringify(marker), 'EX', dayjsDuration(MARKER_TTL_DAYS, 'days').asSeconds())
}

function defaultIntervalMs(): number {
    return system.getNumberOrThrow(AppSystemProp.TRIGGER_DEFAULT_POLL_INTERVAL) * MS_PER_MINUTE
}

function keyOf({ workflowId }: { workflowId: string }): string {
    return `trigger_poll_marker:${workflowId}`
}

const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60 * MS_PER_SECOND
const MISSED_POLLS_TO_COUNT_AS_GAP = 2
const GRACE_SECONDS = 30
const MARKER_TTL_DAYS = 30
const PollMarker = z.object({ at: z.number(), intervalMs: z.number() })

type PollMarker = z.infer<typeof PollMarker>

export type PollGap = {
    gapSeconds: number
    caughtUp: boolean
}
