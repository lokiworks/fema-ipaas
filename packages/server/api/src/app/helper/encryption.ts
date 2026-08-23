import * as crypto from 'crypto'
import { randomBytes } from 'node:crypto'
import { promisify } from 'util'

import { ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { Mutex } from 'async-mutex'
import { z } from 'zod'
import { RedisType } from '../database/redis/types'
import { redisConnections } from '../database/redis-connections'
import { localFileStore } from './local-store'
import { system } from './system/system'
import { AppSystemProp } from './system/system-props'

const algorithm = 'aes-256-cbc'
const ivLength = 16
const keyIdLength = 8
const mutexLock = new Mutex()

export const EncryptedObject = z.object({
    iv: z.string(),
    data: z.string(),
    keyId: z.string().optional(),
})
export type EncryptedObject = z.infer<typeof EncryptedObject>
const redisType = redisConnections.getRedisType()

export const encryptUtils = {
    decryptString: async (encryptedObject: EncryptedObject): Promise<string> => {
        return decryptWith(encryptedObject)
    },
    decryptObject: async <T>(encryptedObject: EncryptedObject): Promise<T> => {
        return JSON.parse(await decryptWith(encryptedObject))
    },
    encryptObject: async (object: unknown): Promise<EncryptedObject> => {
        return encryptUtils.encryptString(JSON.stringify(object))
    },
    encryptString: async (inputString: string): Promise<EncryptedObject> => {
        const secret = await encryptUtils.getEncryptionKey()
        assertNotNullOrUndefined(secret, 'secret')
        const iv = crypto.randomBytes(ivLength)
        const cipher = crypto.createCipheriv(algorithm, Buffer.from(secret, 'binary'), iv)
        let encrypted = cipher.update(inputString, 'utf8', 'hex')
        encrypted += cipher.final('hex')
        return {
            iv: iv.toString('hex'),
            data: encrypted,
            keyId: keyIdOf(secret),
        }
    },
    isEncryptedWithCurrentKey: async (encryptedObject: EncryptedObject): Promise<boolean> => {
        const secret = await encryptUtils.getEncryptionKey()
        if (isNil(secret)) {
            return false
        }
        return encryptedObject.keyId === keyIdOf(secret)
    },
    hmacString: async (inputString: string): Promise<string> => {
        const secret = await encryptUtils.getEncryptionKey()
        assertNotNullOrUndefined(secret, 'secret')
        return crypto.createHmac('sha256', Buffer.from(secret, 'binary')).update(inputString).digest('hex')
    },
    digestsMatch: (stored: string, candidate: string): boolean => {
        const left = Buffer.from(stored, 'utf8')
        const right = Buffer.from(candidate, 'utf8')
        return left.length === right.length && crypto.timingSafeEqual(left, right)
    },
    getEncryptionKey: async (): Promise<string | null> => {
        const secret = system.get(AppSystemProp.ENCRYPTION_KEY) ?? null
        if (!isNil(secret)) {
            return secret
        }
        if (redisType === RedisType.MEMORY) {
            return generateAndStoreSecret()
        }
        return null
    },
    getRetiredEncryptionKeys: (): string[] => {
        const raw = system.get(AppSystemProp.RETIRED_ENCRYPTION_KEYS)
        if (isNil(raw) || raw.trim().length === 0) {
            return []
        }
        return raw.split(',').map((key) => key.trim()).filter((key) => key.length > 0)
    },
}

async function decryptWith(encryptedObject: EncryptedObject): Promise<string> {
    for (const key of await candidateKeys(encryptedObject)) {
        const decrypted = tryDecrypt(encryptedObject, key)
        if (!isNil(decrypted)) {
            return decrypted
        }
    }
    throw new ApplicationError({
        code: ErrorCode.INVALID_CONNECTION,
        params: {
            error: isNil(encryptedObject.keyId)
                ? 'Could not decrypt with the current or any retired encryption key'
                : `No configured encryption key matches keyId ${encryptedObject.keyId}`,
        },
    })
}

async function candidateKeys(encryptedObject: EncryptedObject): Promise<string[]> {
    const current = await encryptUtils.getEncryptionKey()
    const all = [...(isNil(current) ? [] : [current]), ...encryptUtils.getRetiredEncryptionKeys()]
    if (isNil(encryptedObject.keyId)) {
        return all
    }
    const matching = all.filter((key) => keyIdOf(key) === encryptedObject.keyId)
    return matching.length > 0 ? matching : all
}

function tryDecrypt(encryptedObject: EncryptedObject, key: string): string | null {
    try {
        const iv = Buffer.from(encryptedObject.iv, 'hex')
        const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'binary'), iv)
        let decrypted = decipher.update(encryptedObject.data, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        return decrypted
    }
    catch {
        return null
    }
}

function keyIdOf(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, keyIdLength)
}

function generateAndStoreSecret(): Promise<string> {
    return mutexLock.runExclusive(async () => {
        const storedSecret = await localFileStore.load(AppSystemProp.ENCRYPTION_KEY)
        if (!isNil(storedSecret)) {
            return storedSecret
        }
        const secretLengthInBytes = 16
        const secretBuffer = await promisify(randomBytes)(secretLengthInBytes)
        const secret = secretBuffer.toString('hex')
        await localFileStore.save(AppSystemProp.ENCRYPTION_KEY, secret)
        return secret
    })
}
