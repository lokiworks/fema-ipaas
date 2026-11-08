import { FEDERATION_LIMITS } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { federationSignature } from '../../../../src/app/federation/federation-signature'

const mocks = vi.hoisted(() => ({
    getOne: vi.fn(),
    getOneWithFederatedAuthOrThrow: vi.fn(),
    restoreBySubject: vi.fn(),
    revokeBySubject: vi.fn(),
    putIfAbsent: vi.fn(),
    deleteKey: vi.fn(),
    sendUserEvent: vi.fn(),
    readState: vi.fn(),
    accessTokenFor: vi.fn(),
}))

vi.mock('../../../../src/app/tenant/tenant.service', () => ({
    tenantService: () => ({ getOne: mocks.getOne, getOneWithFederatedAuthOrThrow: mocks.getOneWithFederatedAuthOrThrow }),
}))
vi.mock('../../../../src/app/federation/external-identity.service', () => ({
    externalIdentityService: () => ({ restoreBySubject: mocks.restoreBySubject, revokeBySubject: mocks.revokeBySubject }),
}))
vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedStore: { putIfAbsent: mocks.putIfAbsent, delete: mocks.deleteKey },
}))
vi.mock('../../../../src/app/helper/application-events', () => ({
    applicationEvents: () => ({ sendUserEvent: mocks.sendUserEvent }),
}))
vi.mock('../../../../src/app/helper/encryption', () => ({
    encryptUtils: { decryptString: async (value: { data: string }) => value.data.replace('enc:', '') },
}))
vi.mock('../../../../src/app/federation/member-directory', () => ({
    memberDirectory: { readState: mocks.readState },
}))
vi.mock('../../../../src/app/federation/member-subscription.service', () => ({
    memberSubscriptionService: () => ({ accessTokenFor: mocks.accessTokenFor }),
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const secret = 'plain-secret-from-registration'
const issuer = 'https://iam.test'

function pushOf(overrides: Record<string, unknown> = {}) {
    return { id: 'evt-1', type: 'iam-identity.member.suspend', tenantId: 'iam-tenant-1', occurredAt: '2026-11-08T00:00:00Z', object: { code: 'member', id: 'm1' }, ...overrides }
}

function signed(body: Record<string, unknown>, withSecret = secret) {
    const rawBody = JSON.stringify(body)
    return { rawBody, signature: federationSignature.sign({ rawBody, secret: withSecret }) }
}

async function receive(input: { rawBody: string, signature: string | undefined }) {
    const { memberEventService } = await import('../../../../src/app/federation/member-event.service')
    return memberEventService(log as never).receive({ tenantId: 'tenant-1', ip: '10.0.0.1', ...input })
}

describe('member event service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getOne.mockResolvedValue({ id: 'tenant-1', externalTenantId: 'iam-tenant-1' })
        mocks.getOneWithFederatedAuthOrThrow.mockResolvedValue({
            id: 'tenant-1',
            federatedAuthProviders: { oidc: { issuer, memberSubscription: { subscriptionId: 'sub-1', apiUrl: 'https://fema.test', plainSecret: { iv: 'i', data: `enc:${secret}` }, projectId: 'p1', connectionExternalId: 'fema-iam' } } },
        })
        mocks.putIfAbsent.mockResolvedValue(true)
        mocks.accessTokenFor.mockResolvedValue('token')
        mocks.readState.mockResolvedValue('INACTIVE')
        mocks.revokeBySubject.mockResolvedValue({ found: true, tenantId: 'tenant-1', userId: 'u1', alreadyRevoked: false })
        mocks.restoreBySubject.mockResolvedValue({ found: true, tenantId: 'tenant-1', userId: 'u1' })
    })

    describe('the verification request', () => {
        it('echoes the challenge without needing a stored secret or a valid signature', async () => {
            mocks.getOneWithFederatedAuthOrThrow.mockResolvedValue({ id: 'tenant-1', federatedAuthProviders: { oidc: { issuer } } })
            const rawBody = JSON.stringify({ id: 'v1', type: 'webhook.verification', challenge: 'abc123' })

            const result = await receive({ rawBody, signature: undefined })

            expect(result).toEqual({ outcome: 'verification', challenge: 'abc123' })
            expect(mocks.putIfAbsent).not.toHaveBeenCalled()
        })

        it('does not echo for a tenant that does not exist', async () => {
            mocks.getOne.mockResolvedValue(null)
            const rawBody = JSON.stringify({ type: 'webhook.verification', challenge: 'abc123' })
            expect(await receive({ rawBody, signature: undefined })).toEqual({ outcome: 'ignored', challenge: null })
        })
    })

    describe('a push', () => {
        it('reads the member and revokes when the member is not in good standing', async () => {
            const result = await receive(signed(pushOf()))
            expect(result.outcome).toBe('applied')
            expect(mocks.readState).toHaveBeenCalledWith({ apiUrl: 'https://fema.test', accessToken: 'token', memberId: 'm1' })
            expect(mocks.revokeBySubject).toHaveBeenCalledWith({ issuer, subject: 'm1', tenantId: 'tenant-1' })
            expect(mocks.restoreBySubject).not.toHaveBeenCalled()
        })

        it('restores when the member is in good standing, whatever the event says', async () => {
            mocks.readState.mockResolvedValue('ACTIVE')
            await receive(signed(pushOf({ type: 'iam-identity.member.suspend' })))
            expect(mocks.restoreBySubject).toHaveBeenCalledWith({ issuer, subject: 'm1', tenantId: 'tenant-1' })
            expect(mocks.revokeBySubject).not.toHaveBeenCalled()
        })

        it('revokes a member that can no longer be found', async () => {
            mocks.readState.mockResolvedValue('GONE')
            await receive(signed(pushOf({ type: 'iam-identity.member.remove' })))
            expect(mocks.revokeBySubject).toHaveBeenCalledTimes(1)
        })

        it.each(['iam-identity.member.suspend', 'iam-identity.member.activate', 'iam-identity.member.remove', 'iam-identity.member.restore'])('accepts %s', async (type) => {
            expect((await receive(signed(pushOf({ type, id: `evt-${type}` })))).outcome).toBe('applied')
        })

        it('uses the registration secret over the exact bytes received', async () => {
            const rawBody = '{ "id":"evt-1", "type":"iam-identity.member.suspend", "tenantId":"iam-tenant-1", "object":{"id":"m1"} }'
            const signature = federationSignature.sign({ rawBody, secret })
            expect((await receive({ rawBody, signature })).outcome).toBe('applied')
            expect((await receive({ rawBody: rawBody.replace('{ ', '{'), signature })).outcome).toBe('ignored')
        })
    })

    describe('what is dropped without any effect', () => {
        it('a wrong signature', async () => {
            expect((await receive(signed(pushOf(), 'another-secret-another-secret'))).outcome).toBe('ignored')
            expect(mocks.putIfAbsent).not.toHaveBeenCalled()
            expect(mocks.revokeBySubject).not.toHaveBeenCalled()
        })

        it('a missing signature', async () => {
            expect((await receive({ rawBody: JSON.stringify(pushOf()), signature: undefined })).outcome).toBe('ignored')
        })

        it('an event type outside the four member events', async () => {
            expect((await receive(signed(pushOf({ type: 'rental-agreement.contract.activate' })))).outcome).toBe('ignored')
            expect(mocks.readState).not.toHaveBeenCalled()
        })

        it('an event of another external tenant', async () => {
            expect((await receive(signed(pushOf({ tenantId: 'someone-else' })))).outcome).toBe('ignored')
            expect(mocks.readState).not.toHaveBeenCalled()
        })

        it('a push for a tenant without a registered subscription', async () => {
            mocks.getOneWithFederatedAuthOrThrow.mockResolvedValue({ id: 'tenant-1', federatedAuthProviders: { oidc: { issuer } } })
            expect((await receive(signed(pushOf()))).outcome).toBe('ignored')
        })

        it('a body that is not JSON', async () => {
            expect((await receive({ rawBody: 'not json', signature: 'sha256=00' })).outcome).toBe('ignored')
        })
    })

    describe('retries', () => {
        it('acts once on an event that arrives again', async () => {
            mocks.putIfAbsent.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
            const body = signed(pushOf())
            expect((await receive(body)).outcome).toBe('applied')
            expect((await receive(body)).outcome).toBe('duplicate')
            expect(mocks.revokeBySubject).toHaveBeenCalledTimes(1)
            expect(mocks.putIfAbsent).toHaveBeenCalledWith('federation:member-event:tenant-1:evt-1', '1', FEDERATION_LIMITS.memberEventDedupeTtlSeconds)
        })

        it('keeps the dedupe window at 24 hours', () => {
            expect(FEDERATION_LIMITS.memberEventDedupeTtlSeconds).toBe(24 * 60 * 60)
        })

        it('fails the push and releases the event id when the member cannot be read, so fema pushes again', async () => {
            mocks.readState.mockRejectedValueOnce(new Error('fema unavailable'))
            await expect(receive(signed(pushOf()))).rejects.toThrow('fema unavailable')
            expect(mocks.deleteKey).toHaveBeenCalledWith('federation:member-event:tenant-1:evt-1')
            expect(mocks.revokeBySubject).not.toHaveBeenCalled()
        })
    })
})
