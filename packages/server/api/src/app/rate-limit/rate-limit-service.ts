import { createHash } from 'node:crypto'
import { RedisType } from '../database/redis/types'
import { redisConnections } from '../database/redis-connections'

async function acquire({ tenantId, bucket, scopeKey, perSecond }: AcquireParams): Promise<{ waitMs: number }> {
    const digest = createHash('sha256').update(JSON.stringify([bucket, scopeKey])).digest('hex')
    const key = `rl:${tenantId}:${digest}`
    const intervalMs = 1000 / perSecond
    if (redisConnections.getRedisType() === RedisType.MEMORY) {
        return acquireInMemory({ key, intervalMs, now: Date.now() })
    }
    const redis = await redisConnections.useExisting()
    const waitMs = await redis.eval(GCRA_SCRIPT, 1, key, intervalMs)
    if (typeof waitMs !== 'number' || !Number.isFinite(waitMs) || waitMs < 0) {
        throw new Error('Invalid rate limit response')
    }
    return { waitMs }
}

function acquireInMemory({ key, intervalMs, now }: { key: string, intervalMs: number, now: number }): { waitMs: number } {
    if (now >= nextSweep) {
        for (const [entryKey, entry] of memoryBuckets) {
            if (entry.expiresAt <= now) {
                memoryBuckets.delete(entryKey)
            }
        }
        nextSweep = now + 2000
    }
    const previous = memoryBuckets.get(key)
    const nextAllowed = previous && previous.expiresAt > now ? previous.nextAllowed : now
    if (nextAllowed > now) {
        return { waitMs: Math.ceil(nextAllowed - now) }
    }
    memoryBuckets.set(key, { nextAllowed: now + intervalMs, expiresAt: now + Math.max(2000, intervalMs * 2) })
    return { waitMs: 0 }
}

const memoryBuckets = new Map<string, { nextAllowed: number, expiresAt: number }>()
let nextSweep = 0

const GCRA_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + tonumber(time[2]) / 1000
local interval = tonumber(ARGV[1])
local nextAllowed = tonumber(redis.call('GET', KEYS[1])) or now
if nextAllowed > now then
    return math.ceil(nextAllowed - now)
end
redis.call('SET', KEYS[1], tostring(now + interval), 'PX', math.ceil(math.max(2000, interval * 2)))
return 0
`

export const rateLimitService = { acquire }

type AcquireParams = {
    tenantId: string
    bucket: string
    scopeKey: string
    perSecond: number
}
