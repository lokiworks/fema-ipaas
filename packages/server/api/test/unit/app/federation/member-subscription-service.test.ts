import { MEMBER_EVENT_TYPES } from '@fema-ipaas/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { femaApiClient, FemaApiResult } from '../../../../src/app/federation/fema-api-client'

const state = vi.hoisted(() => ({
    providers: {} as Record<string, unknown>,
    updates: [] as Array<Record<string, unknown>>,
    token: 'access-token' as string | null,
}))

vi.mock('../../../../src/app/tenant/tenant.service', () => ({
    tenantRepo: () => ({
        update: async (_where: unknown, patch: Record<string, unknown>) => {
            state.updates.push(patch)
        },
    }),
    tenantService: () => ({ getOneWithFederatedAuthOrThrow: async () => ({ id: 'tenant-1', federatedAuthProviders: state.providers }) }),
}))
vi.mock('../../../../src/app/connection/connection-service/connection-service', () => ({
    connectionService: () => ({ getOne: async () => (state.token === null ? null : { value: { access_token: state.token } }) }),
}))
vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedLock: () => ({ runExclusive: ({ fn }: { fn: () => Promise<unknown> }) => fn() }),
}))
vi.mock('../../../../src/app/helper/domain-helper', () => ({
    domainHelper: { getPublicApiUrl: async ({ path }: { path: string }) => `https://ipaas.test/api/${path}` },
}))
vi.mock('../../../../src/app/helper/encryption', () => ({
    encryptUtils: { encryptString: async (value: string) => ({ iv: 'iv', data: `enc:${value}` }) },
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const endpoint = 'https://ipaas.test/api/v1/federation/members/tenant-1'
const input = { connectionExternalId: 'fema-iam', apiUrl: 'https://fema.test' }

type Handler = (body: Record<string, unknown>) => FemaApiResult

function ok(data: unknown): FemaApiResult {
    return { kind: 'response', status: 200, code: 'SUCCESS', data, message: null }
}

function failure(status: number, code: string): FemaApiResult {
    return { kind: 'response', status, code, data: null, message: null }
}

function script(handlers: Record<string, Handler>) {
    const calls: Array<{ path: string, body: Record<string, unknown>, accessToken: string }> = []
    vi.spyOn(femaApiClient, 'call').mockImplementation(async ({ path, body, accessToken }) => {
        const parsed: Record<string, unknown> = typeof body === 'object' && body !== null ? { ...body } : {}
        calls.push({ path, body: parsed, accessToken })
        const handler = handlers[path]
        if (!handler) throw new Error(`unexpected call ${path}`)
        return handler(parsed)
    })
    return calls
}

function storedOidc(memberSubscription?: Record<string, unknown>) {
    return { saml: null, oidc: { issuer: 'https://iam.test', ...(memberSubscription ? { memberSubscription } : {}) } }
}

const existingSubscription = {
    subscriptionId: 'sub-old',
    code: 'ipaas-members-old',
    plainSecret: { iv: 'iv', data: 'enc:old' },
    endpoint,
    apiUrl: 'https://fema.test',
    connectionExternalId: 'fema-iam',
    projectId: 'project-1',
    createdAt: '2026-11-08T00:00:00.000Z',
}

async function load() {
    return import('../../../../src/app/federation/member-subscription.service')
}

async function ensure(overrides: Record<string, unknown> = {}) {
    const { memberSubscriptionService } = await load()
    return memberSubscriptionService(log as never).ensure({ tenantId: 'tenant-1', projectId: 'project-1', input: { ...input, ...overrides } })
}

function savedSubscription(): Record<string, unknown> {
    const written = state.updates[state.updates.length - 1]['federatedAuthProviders'] as { oidc: { memberSubscription: Record<string, unknown> } }
    return written.oidc.memberSubscription
}

describe('member subscription', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        state.providers = storedOidc()
        state.updates = []
        state.token = 'access-token'
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('registering for the first time', () => {
        it('registers the four member events at the tenant endpoint with the integration application token', async () => {
            const calls = script({ '/webhook/subscription/create': () => ok({ id: 'sub-1', plainSecret: 'whsec-1' }) })
            const result = await ensure()
            expect(result).toEqual({ subscriptionId: 'sub-1', endpoint, reused: false, withheldEvents: [] })
            expect(calls).toHaveLength(1)
            expect(calls[0].accessToken).toBe('access-token')
            expect(calls[0].body).toMatchObject({ endpoint, events: [...MEMBER_EVENT_TYPES] })
        })

        it('uses a fresh code of at most 64 characters each time', async () => {
            const { memberSubscriptionUtils } = await load()
            const first = memberSubscriptionUtils.newCode({ endpoint })
            const second = memberSubscriptionUtils.newCode({ endpoint })
            expect(first).not.toBe(second)
            expect(first.length).toBeLessThanOrEqual(64)
            expect(first).toMatch(/^ipaas-members-[0-9a-f]{16}-[0-9a-f]{16}$/)
        })

        it('keeps the id and the secret, encrypted, on the sign-in configuration', async () => {
            script({ '/webhook/subscription/create': () => ok({ id: 'sub-1', plainSecret: 'whsec-1' }) })
            await ensure()
            expect(savedSubscription()).toMatchObject({ subscriptionId: 'sub-1', plainSecret: { data: 'enc:whsec-1' }, endpoint, apiUrl: 'https://fema.test', connectionExternalId: 'fema-iam', projectId: 'project-1' })
        })

        it('reports the events that will not be pushed', async () => {
            script({ '/webhook/subscription/create': () => ok({ id: 'sub-1', plainSecret: 'whsec-1', withheldEvents: ['iam-identity.member.remove'] }) })
            const result = await ensure()
            expect(result.withheldEvents).toEqual(['iam-identity.member.remove'])
            expect(log.warn).toHaveBeenCalled()
        })

        it('needs the sign-in configuration and a working connection', async () => {
            script({})
            state.providers = { saml: null }
            await expect(ensure()).rejects.toMatchObject({ error: { code: 'VALIDATION', params: { message: 'memberEventsRequireOidc' } } })
            state.providers = storedOidc()
            state.token = null
            await expect(ensure()).rejects.toMatchObject({ error: { code: 'VALIDATION', params: { message: 'memberEventsConnectionUnavailable' } } })
        })

        it('refuses an answer without the secret and removes what was registered', async () => {
            const calls = script({
                '/webhook/subscription/create': () => ok({ id: 'sub-1' }),
                '/webhook/subscription/delete': () => ok(null),
            })
            await expect(ensure()).rejects.toMatchObject({ error: { params: { message: 'memberEventsRegistrationRejected' } } })
            expect(calls.map((call) => call.path)).toEqual(['/webhook/subscription/create', '/webhook/subscription/delete'])
            expect(calls[1].body).toEqual({ id: 'sub-1' })
            expect(state.updates).toHaveLength(0)
        })

        it('does not retry a registration fema rejected', async () => {
            const calls = script({ '/webhook/subscription/create': () => failure(403, 'OPERATION_FORBIDDEN') })
            await expect(ensure()).rejects.toMatchObject({ error: { params: { message: 'memberEventsRegistrationRejected' } } })
            expect(calls).toHaveLength(1)
        })
    })

    describe('when the registration may or may not have succeeded', () => {
        it('looks the code up, revokes what it finds and registers again with a new code', async () => {
            let creates = 0
            const calls = script({
                '/webhook/subscription/create': () => {
                    creates += 1
                    return creates === 1 ? { kind: 'unreachable', detail: 'timeout' } : ok({ id: 'sub-2', plainSecret: 'whsec-2' })
                },
                '/webhook/subscription/find-one': () => ok({ id: 'sub-ghost', status: { code: 'ENABLED' } }),
                '/webhook/subscription/delete': () => ok(null),
            })
            const result = await ensure()
            expect(result.subscriptionId).toBe('sub-2')
            expect(calls.map((call) => call.path)).toEqual(['/webhook/subscription/create', '/webhook/subscription/find-one', '/webhook/subscription/delete', '/webhook/subscription/create'])
            expect(calls[1].body).toEqual({ filter: { code: calls[0].body['code'] } })
            expect(calls[2].body).toEqual({ id: 'sub-ghost' })
            expect(calls[3].body['code']).not.toBe(calls[0].body['code'])
        })

        it('takes a server error as uncertain too, and a not found delete as done', async () => {
            let creates = 0
            const calls = script({
                '/webhook/subscription/create': () => {
                    creates += 1
                    return creates === 1 ? failure(502, 'BAD_GATEWAY') : ok({ id: 'sub-2', plainSecret: 'whsec-2' })
                },
                '/webhook/subscription/find-one': () => ok({ id: 'sub-ghost' }),
                '/webhook/subscription/delete': () => failure(404, 'NOT_FOUND'),
            })
            expect((await ensure()).subscriptionId).toBe('sub-2')
            expect(calls).toHaveLength(4)
        })

        it('treats an already existing code as uncertain', async () => {
            let creates = 0
            const calls = script({
                '/webhook/subscription/create': () => {
                    creates += 1
                    return creates === 1 ? failure(409, 'ALREADY_EXISTS') : ok({ id: 'sub-2', plainSecret: 'whsec-2' })
                },
                '/webhook/subscription/find-one': () => ok(null),
            })
            expect((await ensure()).subscriptionId).toBe('sub-2')
            expect(calls.map((call) => call.path)).toEqual(['/webhook/subscription/create', '/webhook/subscription/find-one', '/webhook/subscription/create'])
        })

        it('gives up after the second uncertain attempt', async () => {
            script({
                '/webhook/subscription/create': () => ({ kind: 'unreachable', detail: 'timeout' }),
                '/webhook/subscription/find-one': () => failure(404, 'NOT_FOUND'),
            })
            await expect(ensure()).rejects.toMatchObject({ error: { params: { message: 'memberEventsRegistrationFailed' } } })
            expect(state.updates).toHaveLength(0)
        })
    })

    describe('provisioning again', () => {
        beforeEach(() => {
            state.providers = storedOidc(existingSubscription)
        })

        it('keeps a subscription that is still valid', async () => {
            const calls = script({ '/webhook/subscription/find-one': () => ok({ id: 'sub-old', status: { '@type': 'activation-status', code: 'ENABLED', name: '启用' }, activatedAt: '2026-11-08T00:00:01Z' }) })
            const result = await ensure()
            expect(result).toEqual({ subscriptionId: 'sub-old', endpoint, reused: true, withheldEvents: [] })
            expect(calls.map((call) => call.path)).toEqual(['/webhook/subscription/find-one'])
            expect(state.updates).toHaveLength(0)
        })

        it('keeps it when fema cannot be asked right now', async () => {
            script({ '/webhook/subscription/find-one': () => ({ kind: 'unreachable', detail: 'timeout' }) })
            expect((await ensure()).reused).toBe(true)
        })

        it.each([
            ['gone at fema (404)', () => failure(404, 'NOT_FOUND')],
            ['gone at fema (success without data)', () => ok(null)],
            ['disabled by fema after too many failures', () => ok({ id: 'sub-old', status: { '@type': 'activation-status', code: 'DISABLED', name: '停用' }, activatedAt: '2026-11-08T00:00:01Z' })],
            ['never verified', () => ok({ id: 'sub-old', status: { code: 'ENABLED' }, activatedAt: null })],
            ['answered without an activation time', () => ok({ id: 'sub-old', status: 'ENABLED' })],
        ])('registers again when the subscription is %s', async (_name, found) => {
            const calls = script({
                '/webhook/subscription/find-one': found,
                '/webhook/subscription/delete': () => ok(null),
                '/webhook/subscription/create': () => ok({ id: 'sub-new', plainSecret: 'whsec-new' }),
            })
            const result = await ensure()
            expect(result).toMatchObject({ subscriptionId: 'sub-new', reused: false })
            expect(calls.filter((call) => call.path === '/webhook/subscription/delete').map((call) => call.body)).toEqual([{ id: 'sub-old' }])
            expect(savedSubscription()).toMatchObject({ subscriptionId: 'sub-new', plainSecret: { data: 'enc:whsec-new' } })
        })

        it('revokes and rebuilds to rotate the secret without asking whether the old one is valid', async () => {
            const calls = script({
                '/webhook/subscription/delete': () => ok(null),
                '/webhook/subscription/create': () => ok({ id: 'sub-new', plainSecret: 'whsec-new' }),
            })
            const result = await ensure({ rotateSecret: true })
            expect(result.reused).toBe(false)
            expect(calls.map((call) => call.path)).toEqual(['/webhook/subscription/delete', '/webhook/subscription/create'])
        })

        it('rebuilds when the target of the subscription changed', async () => {
            const calls = script({
                '/webhook/subscription/delete': () => ok(null),
                '/webhook/subscription/create': () => ok({ id: 'sub-new', plainSecret: 'whsec-new' }),
            })
            await ensure({ apiUrl: 'https://fema-b.test' })
            expect(calls.map((call) => call.path)).toEqual(['/webhook/subscription/delete', '/webhook/subscription/create'])
            expect(savedSubscription()).toMatchObject({ apiUrl: 'https://fema-b.test' })
        })
    })
})
