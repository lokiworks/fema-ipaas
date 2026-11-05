import { isNil } from '@fema-ipaas/core-utils'
import { redisConnections } from '../../database/redis-connections'

async function increment({ key, ttlSeconds }: IncrementParams): Promise<number> {
    const redis = await redisConnections.useExisting()
    const value = await redis.incr(key)
    if (value === 1) {
        await redis.expire(key, ttlSeconds)
    }
    return value
}

async function read({ key }: KeyParams): Promise<number> {
    const redis = await redisConnections.useExisting()
    const raw = await redis.get(key)
    return isNil(raw) ? 0 : Number.parseInt(raw, 10)
}

async function reset({ key }: KeyParams): Promise<void> {
    const redis = await redisConnections.useExisting()
    await redis.del(key)
}

export const redisCounter = {
    increment,
    read,
    reset,
}

type KeyParams = {
    key: string
}

type IncrementParams = KeyParams & {
    ttlSeconds: number
}
