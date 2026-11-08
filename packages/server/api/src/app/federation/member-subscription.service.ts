import { createHash, randomBytes } from 'node:crypto'
import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import {
    MEMBER_EVENT_TYPES,
    ProvisionMemberEventsInput,
    ProvisionMemberEventsResult,
    StoredMemberSubscription,
    StoredOidcSso,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { connectionService } from '../connection/connection-service/connection-service'
import { distributedLock } from '../database/redis-connections'
import { domainHelper } from '../helper/domain-helper'
import { encryptUtils } from '../helper/encryption'
import { tenantRepo, tenantService } from '../tenant/tenant.service'
import { femaApiClient } from './fema-api-client'

export const memberSubscriptionService = (log: FastifyBaseLogger) => ({
    async ensure({ tenantId, projectId, input }: EnsureParams): Promise<ProvisionMemberEventsResult> {
        const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
        const oidc = tenant.federatedAuthProviders.oidc
        if (isNil(oidc)) {
            throw validation('memberEventsRequireOidc')
        }
        const endpoint = await domainHelper.getPublicApiUrl({ path: `v1/federation/members/${tenantId}` })
        const accessToken = await accessTokenOf({ log, tenantId, projectId, connectionExternalId: input.connectionExternalId })
        const existing = oidc.memberSubscription ?? null
        const reusable = await findReusable({ log, existing, input, endpoint, projectId, accessToken })
        if (!isNil(reusable)) {
            return { subscriptionId: reusable.subscriptionId, endpoint, reused: true, withheldEvents: [] }
        }
        if (!isNil(existing)) {
            await revokeQuietly({ log, apiUrl: existing.apiUrl, accessToken, subscriptionId: existing.subscriptionId })
        }
        const registered = await register({ log, apiUrl: input.apiUrl, accessToken, endpoint })
        const stored: StoredMemberSubscription = {
            subscriptionId: registered.subscriptionId,
            code: registered.code,
            plainSecret: await encryptUtils.encryptString(registered.plainSecret),
            endpoint,
            apiUrl: input.apiUrl,
            connectionExternalId: input.connectionExternalId,
            projectId,
            createdAt: dayjs().toISOString(),
        }
        await persist({ log, tenantId, subscription: stored })
        if (registered.withheldEvents.length > 0) {
            log.warn({ tenant: { id: tenantId }, withheldEvents: registered.withheldEvents }, '[memberSubscription] the integration application cannot read every member, some events will not be pushed')
        }
        return { subscriptionId: registered.subscriptionId, endpoint, reused: false, withheldEvents: registered.withheldEvents }
    },

    async accessTokenFor({ tenantId, subscription }: AccessTokenForParams): Promise<string> {
        return accessTokenOf({ log, tenantId, projectId: subscription.projectId, connectionExternalId: subscription.connectionExternalId })
    },
})

async function findReusable({ log, existing, input, endpoint, projectId, accessToken }: FindReusableParams): Promise<StoredMemberSubscription | null> {
    const sameTarget = !isNil(existing)
        && input.rotateSecret !== true
        && existing.apiUrl === input.apiUrl
        && existing.endpoint === endpoint
        && existing.connectionExternalId === input.connectionExternalId
        && existing.projectId === projectId
    if (!sameTarget) {
        return null
    }
    const found = await findOne({ apiUrl: existing.apiUrl, accessToken, code: existing.code })
    if (found.kind === 'unknown') {
        log.warn({ detail: found.detail }, '[memberSubscription] could not check the existing subscription, it is kept')
        return existing
    }
    return found.kind === 'found' && found.valid && found.id === existing.subscriptionId ? existing : null
}

async function register({ log, apiUrl, accessToken, endpoint }: RegisterParams): Promise<Registered> {
    for (let attempt = 0; attempt < MAX_REGISTRATION_ATTEMPTS; attempt += 1) {
        const code = newCode({ endpoint })
        const result = await femaApiClient.call({
            apiUrl,
            path: '/webhook/subscription/create',
            method: 'POST',
            accessToken,
            body: { code, endpoint, events: { value: [...MEMBER_EVENT_TYPES] } },
        })
        if (femaApiClient.isSuccess(result) && result.kind === 'response') {
            const parsed = CreatedSubscription.safeParse(result.data)
            if (parsed.success && !isNil(parsed.data.plainSecret)) {
                return { code, subscriptionId: parsed.data.id, plainSecret: parsed.data.plainSecret, withheldEvents: parsed.data.withheldEvents ?? [] }
            }
            if (parsed.success) {
                await revokeQuietly({ log, apiUrl, accessToken, subscriptionId: parsed.data.id })
            }
            throw validation('memberEventsRegistrationRejected')
        }
        const alreadyExists = result.kind === 'response' && result.code === 'ALREADY_EXISTS'
        if (!femaApiClient.isUncertain(result) && !alreadyExists) {
            log.warn({ detail: femaApiClient.describe(result) }, '[memberSubscription] the subscription was rejected')
            throw validation('memberEventsRegistrationRejected')
        }
        log.warn({ detail: femaApiClient.describe(result), attempt }, '[memberSubscription] registration is uncertain, removing what may exist and trying again with a new code')
        await cleanUpCode({ log, apiUrl, accessToken, code })
    }
    throw validation('memberEventsRegistrationFailed')
}

async function cleanUpCode({ log, apiUrl, accessToken, code }: { log: FastifyBaseLogger, apiUrl: string, accessToken: string, code: string }): Promise<void> {
    const found = await findOne({ apiUrl, accessToken, code })
    if (found.kind === 'found') {
        await revokeQuietly({ log, apiUrl, accessToken, subscriptionId: found.id })
    }
}

async function findOne({ apiUrl, accessToken, code }: { apiUrl: string, accessToken: string, code: string }): Promise<FindOneOutcome> {
    const result = await femaApiClient.call({ apiUrl, path: '/webhook/subscription/find-one', method: 'POST', accessToken, body: { filter: { code } } })
    if (femaApiClient.isNotFound(result)) {
        return { kind: 'missing' }
    }
    if (!femaApiClient.isSuccess(result) || result.kind !== 'response') {
        return { kind: 'unknown', detail: femaApiClient.describe(result) }
    }
    if (isNil(result.data)) {
        return { kind: 'missing' }
    }
    const parsed = FoundSubscription.safeParse(result.data)
    if (!parsed.success) {
        return { kind: 'missing' }
    }
    const status = femaApiClient.enumCode(parsed.data.status)
    const enabled = !isNil(status) && ENABLED_STATUSES.includes(status)
    const verified = !isNil(parsed.data.activatedAt)
    return { kind: 'found', id: parsed.data.id, valid: enabled && verified }
}

async function revokeQuietly({ log, apiUrl, accessToken, subscriptionId }: { log: FastifyBaseLogger, apiUrl: string, accessToken: string, subscriptionId: string }): Promise<void> {
    const result = await femaApiClient.call({ apiUrl, path: '/webhook/subscription/delete', method: 'POST', accessToken, body: { id: subscriptionId } })
    if (!femaApiClient.isSuccess(result) && !femaApiClient.isNotFound(result)) {
        log.warn({ subscriptionId, detail: femaApiClient.describe(result) }, '[memberSubscription] could not revoke a subscription')
    }
}

async function persist({ log, tenantId, subscription }: { log: FastifyBaseLogger, tenantId: string, subscription: StoredMemberSubscription }): Promise<void> {
    await distributedLock(log).runExclusive({
        key: `sso-settings-${tenantId}`,
        timeoutInSeconds: 30,
        fn: async () => {
            const tenant = await tenantService(log).getOneWithFederatedAuthOrThrow(tenantId)
            const oidc: StoredOidcSso | null | undefined = tenant.federatedAuthProviders.oidc
            if (isNil(oidc)) {
                throw validation('memberEventsRequireOidc')
            }
            await tenantRepo().update({ id: tenantId }, { federatedAuthProviders: { ...tenant.federatedAuthProviders, oidc: { ...oidc, memberSubscription: subscription } } })
        },
    })
}

async function accessTokenOf({ log, tenantId, projectId, connectionExternalId }: AccessTokenParams): Promise<string> {
    const connection = await connectionService(log).getOne({ projectId, tenantId, externalId: connectionExternalId })
    const value: unknown = connection?.value
    const token = typeof value === 'object' && value !== null && 'access_token' in value ? value.access_token : null
    if (typeof token !== 'string' || token.length === 0) {
        throw validation('memberEventsConnectionUnavailable')
    }
    return token
}

function newCode({ endpoint }: { endpoint: string }): string {
    const digest = createHash('sha256').update(endpoint).digest('hex').slice(0, DIGEST_LENGTH)
    return `${CODE_PREFIX}${digest}-${randomBytes(RANDOM_BYTES).toString('hex')}`
}

function validation(message: string): ApplicationError {
    return new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
}

const CODE_PREFIX = 'ipaas-members-'
const DIGEST_LENGTH = 16
const RANDOM_BYTES = 8
const MAX_REGISTRATION_ATTEMPTS = 2
const ENABLED_STATUSES = ['ENABLED']

const CreatedSubscription = z.object({
    id: z.string().min(1),
    plainSecret: z.string().min(1).nullish(),
    withheldEvents: z.array(z.string()).optional(),
})

const FoundSubscription = z.object({
    id: z.string().min(1),
    status: z.unknown().optional(),
    activatedAt: z.unknown().optional(),
})

export const memberSubscriptionUtils = {
    newCode,
}

type FindOneOutcome =
    | { kind: 'found', id: string, valid: boolean }
    | { kind: 'missing' }
    | { kind: 'unknown', detail: string }

type Registered = {
    code: string
    subscriptionId: string
    plainSecret: string
    withheldEvents: string[]
}

type EnsureParams = {
    tenantId: string
    projectId: string
    input: ProvisionMemberEventsInput
}

type AccessTokenForParams = {
    tenantId: string
    subscription: StoredMemberSubscription
}

type FindReusableParams = {
    log: FastifyBaseLogger
    existing: StoredMemberSubscription | null
    input: ProvisionMemberEventsInput
    endpoint: string
    projectId: string
    accessToken: string
}

type RegisterParams = {
    log: FastifyBaseLogger
    apiUrl: string
    accessToken: string
    endpoint: string
}

type AccessTokenParams = {
    log: FastifyBaseLogger
    tenantId: string
    projectId: string
    connectionExternalId: string
}
