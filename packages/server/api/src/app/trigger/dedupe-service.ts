
import { DEDUPE_KEY_PROPERTY } from '@fema-ipaas/connector-sdk'
import { dataMapping, isNil } from '@fema-ipaas/core-utils'
import { TriggerDedupeSettings } from '@fema-ipaas/shared'
import { redisConnections } from '../database/redis-connections'

const DUPLICATE_RECORD_EXPIRATION_SECONDS = 30

export const dedupeService = {
    filterUniquePayloads: async (workflowVersionId: string, payloads: unknown[]): Promise<unknown[]> => {
        const filteredPayloads = await Promise.all(payloads.map(async (payload) => isDuplicated(workflowVersionId, payload)))
        return payloads.filter((_, index) => !filteredPayloads[index]).map(removeDedupeKey)
    },
    filterByWorkflowDedupe: async ({ workflowId, settings, payloads }: FilterByWorkflowDedupeParams): Promise<unknown[]> => {
        if (isNil(settings) || !settings.enabled || settings.keyPath.trim().length === 0) {
            return payloads
        }
        const duplicated = await Promise.all(payloads.map(async (payload) => {
            const value = dataMapping.readPath({ root: payload, path: settings.keyPath.trim() })
            if (isNil(value) || value === '') {
                return false
            }
            const key = `workflow-dedupe:${workflowId}:${typeof value === 'object' ? JSON.stringify(value) : String(value)}`
            return (await incrementInRedis(key, settings.windowSeconds)) > 1
        }))
        return payloads.filter((_, index) => !duplicated[index])
    },
}

const isDuplicated = async (workflowVersionId: string, payload: unknown) => {
    const dedupeKeyValue = extractDedupeKey(payload)
    if (isNil(dedupeKeyValue)) {
        return false
    }
    const key = `${workflowVersionId}:${dedupeKeyValue}`
    const value = await incrementInRedis(key, DUPLICATE_RECORD_EXPIRATION_SECONDS)
    return value > 1
}

function removeDedupeKey(payload: unknown): unknown {
    const dedupeKeyValue = extractDedupeKey(payload)
    if (isNil(dedupeKeyValue)) {
        return payload
    }
    return { ...(payload as Record<string, unknown>), [DEDUPE_KEY_PROPERTY]: undefined }
}

function extractDedupeKey(payload: unknown): unknown {
    if (isNil(payload) || typeof payload !== 'object') {
        return null
    }
    return (payload as Record<string, unknown>)[DEDUPE_KEY_PROPERTY]
}


async function incrementInRedis(key: string, expireySeconds: number): Promise<number> {
    const redisConnection = await redisConnections.useExisting()
    const value = await redisConnection.incrby(key, 1)
    if (value > 1) {
        return value
    }
    await redisConnection.expire(key, expireySeconds)
    return value
}

type FilterByWorkflowDedupeParams = {
    workflowId: string
    settings: TriggerDedupeSettings | undefined
    payloads: unknown[]
}
