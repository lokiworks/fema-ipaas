import { FEDERATION_LIMITS, TenantStatus } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { federationSignature } from '../../../../src/app/federation/federation-signature'

const mocks = vi.hoisted(() => ({
    getByExternalRef: vi.fn(),
    getOneWithFederatedAuthOrThrow: vi.fn(),
    setStatus: vi.fn(),
    revokeBySubject: vi.fn(),
    restoreBySubject: vi.fn(),
    putIfAbsent: vi.fn(),
    deleteKey: vi.fn(),
    sendUserEvent: vi.fn(),
}))

vi.mock('../../../../src/app/tenant/tenant.service', () => ({
    tenantService: () => ({
        getByExternalRef: mocks.getByExternalRef,
        getOneWithFederatedAuthOrThrow: mocks.getOneWithFederatedAuthOrThrow,
        setStatus: mocks.setStatus,
    }),
}))
vi.mock('../../../../src/app/federation/external-identity.service', () => ({
    externalIdentityService: () => ({ revokeBySubject: mocks.revokeBySubject, restoreBySubject: mocks.restoreBySubject }),
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

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const secret = 'event-signing-secret-1234'
const issuer = 'https://iam.test'

function signed(event: Record<string, unknown>, withSecret = secret) {
    const rawBody = JSON.stringify(event)
    return { rawBody, signature: federationSignature.sign({ rawBody, secret: withSecret }) }
}

function eventOf(overrides: Record<string, unknown> = {}) {
    return { id: 'evt-1', type: 'MEMBER_REMOVED', issuer, externalTenantId: 'iam-tenant-1', subject: 'm1', occurredAt: '2026-11-05T00:00:00Z', ...overrides }
}

async function receive(input: { rawBody: string, signature: string | undefined }) {
    const { federationEventService } = await import('../../../../src/app/federation/federation-event.service')
    return federationEventService(log as never).receive({ ...input, ip: '10.0.0.1' })
}

describe('federation event service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getByExternalRef.mockResolvedValue({ id: 'tenant-1' })
        mocks.getOneWithFederatedAuthOrThrow.mockResolvedValue({ id: 'tenant-1', federatedAuthProviders: { oidc: { eventSigningSecret: { iv: 'i', data: `enc:${secret}` } } } })
        mocks.putIfAbsent.mockResolvedValue(true)
        mocks.revokeBySubject.mockResolvedValue({ found: true, tenantId: 'tenant-1', userId: 'u1', alreadyRevoked: false })
        mocks.restoreBySubject.mockResolvedValue({ found: true, tenantId: 'tenant-1', userId: 'u1' })
    })

    it('finds the tenant by issuer and external tenant id', async () => {
        await receive(signed(eventOf()))
        expect(mocks.getByExternalRef).toHaveBeenCalledWith({ issuer, tenantId: 'iam-tenant-1' })
    })

    it('revokes a removed member within the sending tenant only', async () => {
        const result = await receive(signed(eventOf()))
        expect(result).toEqual({ duplicate: false })
        expect(mocks.revokeBySubject).toHaveBeenCalledWith({ issuer, subject: 'm1', tenantId: 'tenant-1' })
    })

    it('restores a restored member', async () => {
        await receive(signed(eventOf({ type: 'MEMBER_RESTORED' })))
        expect(mocks.restoreBySubject).toHaveBeenCalledWith({ issuer, subject: 'm1', tenantId: 'tenant-1' })
    })

    it('suspends and resumes the tenant', async () => {
        await receive(signed(eventOf({ id: 'evt-2', type: 'TENANT_SUSPENDED', subject: undefined })))
        expect(mocks.setStatus).toHaveBeenLastCalledWith({ tenantId: 'tenant-1', status: TenantStatus.SUSPENDED })
        await receive(signed(eventOf({ id: 'evt-3', type: 'TENANT_RESUMED', subject: undefined })))
        expect(mocks.setStatus).toHaveBeenLastCalledWith({ tenantId: 'tenant-1', status: TenantStatus.ACTIVE })
    })

    it('rejects a bad signature without changing anything', async () => {
        const forged = signed(eventOf(), 'another-secret-another-secret')
        await expect(receive(forged)).rejects.toMatchObject({ error: { code: 'AUTHENTICATION' } })
        expect(mocks.revokeBySubject).not.toHaveBeenCalled()
        expect(mocks.putIfAbsent).not.toHaveBeenCalled()
    })

    it('rejects a missing signature, an unknown tenant and a tenant without a signing secret the same way', async () => {
        const body = signed(eventOf())
        await expect(receive({ rawBody: body.rawBody, signature: undefined })).rejects.toMatchObject({ error: { code: 'AUTHENTICATION' } })
        mocks.getByExternalRef.mockResolvedValueOnce(null)
        await expect(receive(body)).rejects.toMatchObject({ error: { code: 'AUTHENTICATION' } })
        mocks.getOneWithFederatedAuthOrThrow.mockResolvedValueOnce({ id: 'tenant-1', federatedAuthProviders: { oidc: {} } })
        await expect(receive(body)).rejects.toMatchObject({ error: { code: 'AUTHENTICATION' } })
        expect(mocks.revokeBySubject).not.toHaveBeenCalled()
    })

    it('rejects a body that is not JSON', async () => {
        await expect(receive({ rawBody: 'not json', signature: 'sha256=00' })).rejects.toMatchObject({ error: { code: 'AUTHENTICATION' } })
    })

    it('verifies the signature over the exact raw bytes, not a re-serialised body', async () => {
        const rawBody = `{ "id":"evt-1", "type":"MEMBER_REMOVED", "issuer":"${issuer}", "externalTenantId":"iam-tenant-1", "subject":"m1", "occurredAt":"2026-11-05T00:00:00Z" }`
        const signature = federationSignature.sign({ rawBody, secret })
        await expect(receive({ rawBody, signature })).resolves.toEqual({ duplicate: false })
        await expect(receive({ rawBody: rawBody.replace('{ ', '{'), signature })).rejects.toBeDefined()
    })

    it('acts once on an event that arrives twice', async () => {
        mocks.putIfAbsent.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
        const body = signed(eventOf())
        expect(await receive(body)).toEqual({ duplicate: false })
        expect(await receive(body)).toEqual({ duplicate: true })
        expect(mocks.revokeBySubject).toHaveBeenCalledTimes(1)
        expect(mocks.putIfAbsent).toHaveBeenCalledWith('federation:event:tenant-1:evt-1', '1', FEDERATION_LIMITS.eventDedupeTtlSeconds)
    })

    it('releases the event id when processing fails so the sender can retry', async () => {
        mocks.revokeBySubject.mockRejectedValueOnce(new Error('database down'))
        await expect(receive(signed(eventOf()))).rejects.toThrow('database down')
        expect(mocks.deleteKey).toHaveBeenCalledWith('federation:event:tenant-1:evt-1')
    })

    it('requires a subject for member events', async () => {
        await expect(receive(signed(eventOf({ subject: undefined })))).rejects.toMatchObject({ error: { code: 'VALIDATION' } })
        expect(mocks.revokeBySubject).not.toHaveBeenCalled()
    })

    it('rejects a signed event with an unknown type', async () => {
        await expect(receive(signed(eventOf({ type: 'SOMETHING_ELSE' })))).rejects.toMatchObject({ error: { code: 'VALIDATION' } })
    })
})
