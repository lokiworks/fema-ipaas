import { createHash } from 'node:crypto'
import { DEDUPE_KEY_PROPERTY } from '@fema-ipaas/connector-sdk'
import { isNil } from '@fema-ipaas/core-utils'
import { TriggerDedupeSettings, triggerRunSettingsUtils } from '@fema-ipaas/shared'
import { redisConnections } from '../database/redis-connections'

const DUPLICATE_RECORD_EXPIRATION_SECONDS = 30

export const dedupeService = {
    filterUniquePayloads: async (workflowVersionId: string, payloads: unknown[]): Promise<unknown[]> => {
        const filteredPayloads = await Promise.all(payloads.map(async (payload) => isDuplicated(workflowVersionId, payload)))
        return payloads.filter((_, index) => !filteredPayloads[index]).map(removeDedupeKey)
    },
    claimWorkflowDedupe: async ({ workflowId, settings, payloads }: ClaimWorkflowDedupeParams): Promise<DedupeClaimResult> => {
        if (isNil(settings) || !settings.enabled || !isNil(triggerRunSettingsUtils.validateKeyPath(settings.keyPath))) {
            return { accepted: payloads.map((payload) => ({ payload, claim: null })), duplicates: [] }
        }
        const evaluated = await Promise.all(payloads.map(async (payload) => claimPayload({ workflowId, settings, payload })))
        const accepted = evaluated.flatMap((item) => (item.kind === 'accepted' ? [{ payload: item.payload, claim: item.claim }] : []))
        const duplicates = evaluated.flatMap((item) => (item.kind === 'duplicate' ? [item.duplicate] : []))
        return { accepted, duplicates }
    },
    bindFirstExecution: async ({ claim, executionId }: { claim: DedupeClaim, executionId: string }): Promise<void> => {
        const redisConnection = await redisConnections.useExisting()
        await redisConnection.eval(BIND_SCRIPT, 1, claim.redisKey, executionId)
    },
}

export const dedupeKeyUtils = {
    hashKey,
    previewKey,
    redisKeyOf,
    legacyRedisKeyOf,
    resolveFirstExecutionId,
}

async function claimPayload({ workflowId, settings, payload }: ClaimPayloadParams): Promise<ClaimOutcome> {
    const keyValue = triggerRunSettingsUtils.readKey({ payload, keyPath: settings.keyPath })
    if (isNil(keyValue)) {
        return { kind: 'accepted', payload, claim: null }
    }
    const keyHash = hashKey(keyValue)
    const redisKey = redisKeyOf({ workflowId, keyHash })
    const redisConnection = await redisConnections.useExisting()
    const legacyExists = await redisConnection.exists(legacyRedisKeyOf({ workflowId, keyValue }))
    const claimed = legacyExists > 0 ? null : await redisConnection.set(redisKey, PENDING_MARKER, 'EX', settings.windowSeconds, 'NX')
    if (claimed === 'OK') {
        return { kind: 'accepted', payload, claim: { redisKey, keyHash } }
    }
    const stored = await redisConnection.get(redisKey)
    return {
        kind: 'duplicate',
        duplicate: {
            payload,
            keyHash,
            keyPreview: previewKey(keyValue),
            firstExecutionId: resolveFirstExecutionId(stored),
        },
    }
}

function hashKey(keyValue: string): string {
    return createHash('sha256').update(keyValue).digest('hex')
}

function previewKey(keyValue: string): string {
    return keyValue.length > MAX_PREVIEW_LENGTH ? `${keyValue.slice(0, MAX_PREVIEW_LENGTH)}…` : keyValue
}

function redisKeyOf({ workflowId, keyHash }: { workflowId: string, keyHash: string }): string {
    return `workflow-dedupe:v2:${workflowId}:${keyHash}`
}

function legacyRedisKeyOf({ workflowId, keyValue }: { workflowId: string, keyValue: string }): string {
    return `workflow-dedupe:${workflowId}:${keyValue}`
}

function resolveFirstExecutionId(stored: string | null): string | null {
    if (isNil(stored) || stored === PENDING_MARKER) {
        return null
    }
    return stored
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

const PENDING_MARKER = 'pending'
const MAX_PREVIEW_LENGTH = 200
const BIND_SCRIPT = `
local ttl = redis.call('PTTL', KEYS[1])
if ttl > 0 then
    redis.call('SET', KEYS[1], ARGV[1], 'PX', ttl)
end
return ttl
`

type ClaimWorkflowDedupeParams = {
    workflowId: string
    settings: TriggerDedupeSettings | undefined
    payloads: unknown[]
}

type ClaimPayloadParams = {
    workflowId: string
    settings: TriggerDedupeSettings
    payload: unknown
}

type ClaimOutcome =
    | { kind: 'accepted', payload: unknown, claim: DedupeClaim | null }
    | { kind: 'duplicate', duplicate: DuplicatePayload }

export type DedupeClaim = {
    redisKey: string
    keyHash: string
}

export type DuplicatePayload = {
    payload: unknown
    keyHash: string
    keyPreview: string
    firstExecutionId: string | null
}

export type DedupeClaimResult = {
    accepted: { payload: unknown, claim: DedupeClaim | null }[]
    duplicates: DuplicatePayload[]
}
