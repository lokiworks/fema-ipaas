import { createHash, randomBytes } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { distributedStore, redisConnections } from '../../database/redis-connections'

async function issue<T>({ purpose, payload, ttlSeconds }: IssueParams<T>): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    await distributedStore.put(keyOf({ purpose, token }), payload, ttlSeconds)
    return token
}

async function peek<T>({ purpose, token }: TokenParams): Promise<T | null> {
    return distributedStore.get<T>(keyOf({ purpose, token }))
}

async function consume<T>({ purpose, token }: TokenParams): Promise<T | null> {
    const key = keyOf({ purpose, token })
    const redis = await redisConnections.useExisting()
    const raw = await redis.get(key)
    if (isNil(raw)) {
        return null
    }
    const removed = await redis.del(key)
    if (removed !== 1) {
        return null
    }
    return JSON.parse(raw)
}

async function discard({ purpose, token }: TokenParams): Promise<void> {
    await distributedStore.delete(keyOf({ purpose, token }))
}

function keyOf({ purpose, token }: TokenParams): string {
    return `auth-ticket:${purpose}:${createHash('sha256').update(token).digest('hex')}`
}

const TOKEN_BYTES = 32

export const authTicket = {
    issue,
    peek,
    consume,
    discard,
    keyOf,
}

type TokenParams = {
    purpose: string
    token: string
}

type IssueParams<T> = {
    purpose: string
    payload: T
    ttlSeconds: number
}
