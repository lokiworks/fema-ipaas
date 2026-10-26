import Redis from 'ioredis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { redisConnections } from '../../../src/app/database/redis-connections'
import { RedisType } from '../../../src/app/database/redis/types'
import { rateLimitService } from '../../../src/app/rate-limit/rate-limit-service'

vi.mock('../../../src/app/database/redis-connections', () => ({ redisConnections: { getRedisType: vi.fn(), useExisting: vi.fn() } }))

afterEach(() => vi.restoreAllMocks())

describe('proactive rate limiting', () => {
    it('serializes concurrent acquisitions and isolates tenants, buckets and scope keys', async () => {
        vi.mocked(redisConnections.getRedisType).mockReturnValue(RedisType.MEMORY)
        vi.spyOn(Date, 'now').mockReturnValue(10000)
        const params = { tenantId: 'a', bucket: 'write', scopeKey: 'app1', perSecond: 1 }
        const results = await Promise.all(Array.from({ length: 20 }, () => rateLimitService.acquire(params)))
        expect(results.filter((result) => result.waitMs === 0)).toHaveLength(1)
        expect(results.filter((result) => result.waitMs === 1000)).toHaveLength(19)
        expect(await rateLimitService.acquire({ ...params, tenantId: 'b' })).toEqual({ waitMs: 0 })
        expect(await rateLimitService.acquire({ ...params, bucket: 'read' })).toEqual({ waitMs: 0 })
        expect(await rateLimitService.acquire({ ...params, scopeKey: 'app2' })).toEqual({ waitMs: 0 })
        vi.spyOn(Date, 'now').mockReturnValue(11000)
        expect(await rateLimitService.acquire(params)).toEqual({ waitMs: 0 })
    })

    it('uses an atomic Redis script for shared deployments', async () => {
        vi.mocked(redisConnections.getRedisType).mockReturnValue(RedisType.STANDALONE)
        const redis = new Redis({ lazyConnect: true })
        const evalScript = vi.spyOn(redis, 'eval').mockResolvedValue(20)
        vi.mocked(redisConnections.useExisting).mockResolvedValue(redis)
        expect(await rateLimitService.acquire({ tenantId: 't', bucket: 'api', scopeKey: 'a', perSecond: 50 })).toEqual({ waitMs: 20 })
        expect(evalScript).toHaveBeenCalledWith(expect.stringContaining("redis.call('TIME')"), 1, expect.stringMatching(/^rl:t:/), 20)
    })
})
