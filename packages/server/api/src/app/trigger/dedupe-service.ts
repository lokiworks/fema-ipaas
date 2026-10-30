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
    claimWorkflowDedupe: async ({ workflowId, settings, payloads, findFailedExecutionIds }: ClaimWorkflowDedupeParams): Promise<DedupeClaimResult> => {
        if (isNil(settings) || !settings.enabled || !isNil(triggerRunSettingsUtils.validateKeyPath(settings.keyPath))) {
            return { accepted: payloads.map((payload) => ({ payload, claim: null })), duplicates: [] }
        }
        const evaluated = await Promise.all(payloads.map(async (payload) => claimPayload({ workflowId, settings, payload })))
        const boundExecutionIds = [...new Set(evaluated.flatMap((item) => (item.kind === 'duplicate' && !isNil(item.duplicate.firstExecutionId) ? [item.duplicate.firstExecutionId] : [])))]
        const failedExecutionIds = boundExecutionIds.length === 0 ? new Set<string>() : new Set(await findFailedExecutionIds({ executionIds: boundExecutionIds }))
        const settled = failedExecutionIds.size === 0 ? evaluated : await Promise.all(evaluated.map(async (item) => reclaimAfterFailedRun({ item, failedExecutionIds, windowSeconds: settings.windowSeconds })))
        const accepted = settled.flatMap((item) => (item.kind === 'accepted' ? [{ payload: item.payload, claim: item.claim }] : []))
        const duplicates = settled.flatMap((item) => (item.kind === 'duplicate' ? [item.duplicate] : []))
        return { accepted, duplicates }
    },
    bindFirstExecution: async ({ claim, executionId }: { claim: DedupeClaim, executionId: string }): Promise<void> => {
        const redisConnection = await redisConnections.useExisting()
        await redisConnection.eval(BIND_SCRIPT, 1, claim.redisKey, executionId)
    },
    releaseClaim: async ({ claim }: { claim: DedupeClaim }): Promise<void> => {
        const redisConnection = await redisConnections.useExisting()
        await redisConnection.eval(RELEASE_SCRIPT, 1, claim.redisKey, PENDING_MARKER)
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
    const takenOver = legacyExists > 0 ? 0 : await redisConnection.eval(TAKE_OVER_SCRIPT, 1, redisKey, PENDING_MARKER, settings.windowSeconds * MS_PER_SECOND, STALE_PENDING_CLAIM_MS)
    if (takenOver === 1) {
        return { kind: 'accepted', payload, claim: { redisKey, keyHash } }
    }
    const stored = await redisConnection.get(redisKey)
    return {
        kind: 'duplicate',
        redisKey,
        duplicate: {
            payload,
            keyHash,
            keyPreview: previewKey(keyValue),
            firstExecutionId: resolveFirstExecutionId(stored),
        },
    }
}

async function reclaimAfterFailedRun({ item, failedExecutionIds, windowSeconds }: ReclaimParams): Promise<ClaimOutcome> {
    if (item.kind !== 'duplicate' || isNil(item.duplicate.firstExecutionId) || !failedExecutionIds.has(item.duplicate.firstExecutionId)) {
        return item
    }
    const { payload, keyHash, firstExecutionId } = item.duplicate
    const redisKey = item.redisKey
    const redisConnection = await redisConnections.useExisting()
    const reclaimed = await redisConnection.eval(RECLAIM_FAILED_SCRIPT, 1, redisKey, firstExecutionId, PENDING_MARKER, windowSeconds * MS_PER_SECOND)
    if (reclaimed === 1) {
        return { kind: 'accepted', payload, claim: { redisKey, keyHash } }
    }
    const stored = await redisConnection.get(redisKey)
    return { kind: 'duplicate', redisKey, duplicate: { ...item.duplicate, firstExecutionId: resolveFirstExecutionId(stored) } }
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
const MS_PER_SECOND = 1000
const STALE_PENDING_CLAIM_MS = 2 * 60 * 1000
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
`
const TAKE_OVER_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
    return 0
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
    return 0
end
local age = tonumber(ARGV[2]) - ttl
if age < tonumber(ARGV[3]) then
    return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 1
`
const RECLAIM_FAILED_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
    return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1
`
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
    findFailedExecutionIds: (params: { executionIds: string[] }) => Promise<string[]>
}

type ReclaimParams = {
    item: ClaimOutcome
    failedExecutionIds: Set<string>
    windowSeconds: number
}

type ClaimPayloadParams = {
    workflowId: string
    settings: TriggerDedupeSettings
    payload: unknown
}

type ClaimOutcome =
    | { kind: 'accepted', payload: unknown, claim: DedupeClaim | null }
    | { kind: 'duplicate', redisKey: string, duplicate: DuplicatePayload }

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
