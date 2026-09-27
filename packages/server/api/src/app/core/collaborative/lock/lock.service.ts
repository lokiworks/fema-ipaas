import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { redisConnections } from '../../../database/redis-connections'
import { EditLockValue, LockDecisionKind, lockPolicy } from './lock-policy'

const LOCK_TTL_SECONDS = 60
const KEY_PREFIX = 'lock:'

export const lockService = (log: FastifyBaseLogger) => ({
    async acquire({ resourceId, userId, userDisplayName, force, active }: AcquireParams): Promise<AcquireResult> {
        log.debug({ resourceId, user: { id: userId }, force }, '[Lock] Attempting to acquire lock')
        const redis = await redisConnections.useExisting()
        const key = KEY_PREFIX + resourceId
        const existing = parseLock(await redis.get(key))
        const now = Date.now()
        const decision = lockPolicy.decide({ existing, userId, force: force ?? false, now })
        if (decision.kind === LockDecisionKind.DENY && !isNil(existing)) {
            log.debug({ resourceId, user: { id: userId }, lockedByUserId: existing.userId }, '[Lock] Lock already held by another user')
            return { acquired: false, lock: publicLock(existing), previousUserId: null, takenOver: false }
        }
        const value = lockPolicy.nextValue({ existing, decision, userId, userDisplayName, active: active ?? false, now })
        if (isNil(existing)) {
            const setResult = await redis.set(key, JSON.stringify(value), 'EX', LOCK_TTL_SECONDS, 'NX')
            if (setResult === null) {
                const winner = parseLock(await redis.get(key))
                if (!isNil(winner) && winner.userId !== userId) {
                    return { acquired: false, lock: publicLock(winner), previousUserId: null, takenOver: false }
                }
                await redis.set(key, JSON.stringify(value), 'EX', LOCK_TTL_SECONDS)
            }
        }
        else {
            await redis.set(key, JSON.stringify(value), 'EX', LOCK_TTL_SECONDS)
        }
        log.debug({ resourceId, user: { id: userId }, decision: decision.kind }, '[Lock] Lock acquired')
        return {
            acquired: true,
            lock: null,
            previousUserId: decision.previousUserId ?? null,
            takenOver: decision.kind === LockDecisionKind.TAKE_OVER,
        }
    },

    async release({ resourceId, userId }: ReleaseParams): Promise<boolean> {
        log.debug({ resourceId, user: { id: userId } }, '[Lock] Attempting to release lock')
        const redis = await redisConnections.useExisting()
        const key = KEY_PREFIX + resourceId
        const existing = parseLock(await redis.get(key))
        if (isNil(existing)) {
            log.debug({ resourceId, user: { id: userId } }, '[Lock] No lock found to release')
            return false
        }
        if (existing.userId !== userId) {
            log.debug({ resourceId, user: { id: userId }, lockedByUserId: existing.userId }, '[Lock] Cannot release lock held by another user')
            return false
        }
        await redis.del(key)
        log.debug({ resourceId, user: { id: userId } }, '[Lock] Lock released')
        return true
    },

    async getLock({ resourceId }: GetLockParams): Promise<EditLockValue | null> {
        const redis = await redisConnections.useExisting()
        const lock = parseLock(await redis.get(KEY_PREFIX + resourceId))
        log.debug({ resourceId, hasLock: !isNil(lock) }, '[Lock] Get lock')
        if (isNil(lock) || lockPolicy.isExpired({ lock, now: Date.now() })) {
            return null
        }
        return lock
    },

    async assertNotLockedByOther({ resourceId, userId }: { resourceId: string, userId: string | undefined }): Promise<void> {
        const lock = await lockService(log).getLock({ resourceId })
        if (isNil(lock) || lock.userId === userId) {
            return
        }
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: `${lock.userDisplayName} is editing this workflow. It cannot be published until they finish or the lock is taken over.` },
        })
    },
})

function parseLock(raw: string | null): EditLockValue | null {
    if (isNil(raw)) {
        return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || isNil(parsed) || !('userId' in parsed) || !('userDisplayName' in parsed)) {
        return null
    }
    const lastActiveAt = 'lastActiveAt' in parsed && typeof parsed.lastActiveAt === 'string' ? parsed.lastActiveAt : undefined
    return {
        userId: String(parsed.userId),
        userDisplayName: String(parsed.userDisplayName),
        lastActiveAt,
    }
}

function publicLock(lock: EditLockValue): PublicLock {
    return {
        userId: lock.userId,
        userDisplayName: lock.userDisplayName,
        expiresAt: lockPolicy.expiresAt(lock),
    }
}

type PublicLock = {
    userId: string
    userDisplayName: string
    expiresAt?: string
}

type AcquireParams = {
    resourceId: string
    userId: string
    userDisplayName: string
    force?: boolean
    active?: boolean
}

type AcquireResult = {
    acquired: boolean
    lock: PublicLock | null
    previousUserId: string | null
    takenOver: boolean
}

type ReleaseParams = {
    resourceId: string
    userId: string
}

type GetLockParams = {
    resourceId: string
}
