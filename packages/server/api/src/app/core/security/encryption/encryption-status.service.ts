import { createHash } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { RedisType } from '@fema-ipaas/server-utils'
import { ENCRYPTION_KEY_ROTATION_DAYS, EncryptionKeySource, EncryptionKeyStatus } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { redisConnections } from '../../../database/redis-connections'
import { FlagEntity } from '../../../flags/flag.entity'
import { encryptUtils } from '../../../helper/encryption'
import { system } from '../../../helper/system/system'
import { AppSystemProp } from '../../../helper/system/system-props'
import { repoFactory } from '../../db/repo-factory'

const flagRepo = repoFactory(FlagEntity)

export const encryptionStatusService = (log: FastifyBaseLogger) => ({
    async get(): Promise<EncryptionKeyStatus> {
        const key = await encryptUtils.getEncryptionKey()
        const keyId = isNil(key) ? null : fingerprint(key)
        const observation = await readObservation()
        const current = isNil(keyId) ? observation : await observe({ keyId, observation })
        const ageDays = isNil(current?.firstObservedAt) ? null : dayjs().diff(dayjs(current.firstObservedAt), 'day')
        return {
            algorithm: ALGORITHM,
            source: keySource(),
            keyId,
            firstObservedAt: current?.firstObservedAt ?? null,
            ageDays,
            rotationRecommended: rotationRecommended(ageDays),
            retiredKeys: encryptUtils.getRetiredEncryptionKeys().length,
            lastReencryptedAt: current?.lastReencryptedAt ?? null,
        }
    },

    async recordReencryption(): Promise<void> {
        const observation = await readObservation()
        const key = await encryptUtils.getEncryptionKey()
        const keyId = isNil(key) ? observation?.keyId ?? null : fingerprint(key)
        if (isNil(keyId)) {
            return
        }
        await writeObservation({
            keyId,
            firstObservedAt: observation?.keyId === keyId ? observation.firstObservedAt : dayjs().toISOString(),
            lastReencryptedAt: dayjs().toISOString(),
        })
        log.info({ keyId }, '[encryptionStatus] re-encryption recorded')
    },
})

async function observe({ keyId, observation }: ObserveParams): Promise<KeyObservation> {
    if (!isNil(observation) && observation.keyId === keyId) {
        return observation
    }
    const fresh: KeyObservation = {
        keyId,
        firstObservedAt: dayjs().toISOString(),
        lastReencryptedAt: null,
    }
    await writeObservation(fresh)
    return fresh
}

async function readObservation(): Promise<KeyObservation | null> {
    const flag = await flagRepo().findOneBy({ id: OBSERVATION_FLAG_ID })
    const value: unknown = flag?.value
    if (typeof value !== 'object' || isNil(value)) {
        return null
    }
    const keyId = 'keyId' in value && typeof value.keyId === 'string' ? value.keyId : null
    const firstObservedAt = 'firstObservedAt' in value && typeof value.firstObservedAt === 'string' ? value.firstObservedAt : null
    const lastReencryptedAt = 'lastReencryptedAt' in value && typeof value.lastReencryptedAt === 'string' ? value.lastReencryptedAt : null
    if (isNil(keyId) || isNil(firstObservedAt)) {
        return null
    }
    return { keyId, firstObservedAt, lastReencryptedAt }
}

async function writeObservation(observation: KeyObservation): Promise<void> {
    await flagRepo().save({ id: OBSERVATION_FLAG_ID, value: observation })
}

function keySource(): EncryptionKeySource {
    if (!isNil(system.get(AppSystemProp.ENCRYPTION_KEY))) {
        return EncryptionKeySource.ENVIRONMENT
    }
    return redisConnections.getRedisType() === RedisType.MEMORY ? EncryptionKeySource.GENERATED_FILE : EncryptionKeySource.MISSING
}

function fingerprint(key: string): string {
    return createHash('sha256').update(key).digest('hex').slice(0, FINGERPRINT_LENGTH)
}

function rotationRecommended(ageDays: number | null): boolean {
    return !isNil(ageDays) && ageDays > ENCRYPTION_KEY_ROTATION_DAYS
}

const ALGORITHM = 'AES-256-CBC'
const OBSERVATION_FLAG_ID = 'ENCRYPTION_KEY_OBSERVATION'
const FINGERPRINT_LENGTH = 8

export const encryptionStatusUtils = {
    fingerprint,
    rotationRecommended,
}

type KeyObservation = {
    keyId: string
    firstObservedAt: string
    lastReencryptedAt: string | null
}

type ObserveParams = {
    keyId: string
    observation: KeyObservation | null
}
