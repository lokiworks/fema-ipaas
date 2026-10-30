import { createHash } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { distributedStore } from '../../database/redis-connections'

export const sessionRevocation = {
    async revoke({ token, expiresAtSeconds, nowMs }: RevokeParams): Promise<void> {
        const ttlInSeconds = sessionRevocationUtils.remainingSeconds({ expiresAtSeconds, nowMs })
        if (ttlInSeconds <= 0) {
            return
        }
        await distributedStore.put(sessionRevocationUtils.keyOf(token), REVOKED_MARKER, ttlInSeconds)
    },

    async isRevoked(token: string): Promise<boolean> {
        const marker = await distributedStore.get<string>(sessionRevocationUtils.keyOf(token))
        return !isNil(marker)
    },
}

function keyOf(token: string): string {
    return `revoked_session:v1:${createHash('sha256').update(token).digest('hex')}`
}

function remainingSeconds({ expiresAtSeconds, nowMs }: { expiresAtSeconds: number | undefined, nowMs: number }): number {
    if (isNil(expiresAtSeconds)) {
        return FALLBACK_TTL_SECONDS
    }
    return Math.ceil(expiresAtSeconds - nowMs / 1000)
}

export const sessionRevocationUtils = {
    keyOf,
    remainingSeconds,
}

const REVOKED_MARKER = '1'
const FALLBACK_TTL_SECONDS = 30 * 24 * 60 * 60

type RevokeParams = {
    token: string
    expiresAtSeconds: number | undefined
    nowMs: number
}
