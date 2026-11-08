import { ErrorCode } from '@fema-ipaas/core-utils'
import { PlatformClientKind, PlatformScope, TenantStatus } from '@fema-ipaas/shared'
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformCaller } from '../../../../src/app/platform/platform-auth'
import { platformTenantService } from '../../../../src/app/platform/platform-tenant.service'

const findOneBy = vi.fn()
const getByExternalRef = vi.fn()
const markDeleting = vi.fn()
const rename = vi.fn()
const ensureOwnerProject = vi.fn()
const scheduleHardDelete = vi.fn()

vi.mock('../../../../src/app/tenant/tenant.service', () => ({
    tenantRepo: () => ({ findOneBy: (...args: unknown[]) => findOneBy(...args) }),
    tenantService: () => ({
        getByExternalRef: (...args: unknown[]) => getByExternalRef(...args),
        markDeleting: (...args: unknown[]) => markDeleting(...args),
        rename: (...args: unknown[]) => rename(...args),
        ensureOwnerProject: (...args: unknown[]) => ensureOwnerProject(...args),
    }),
}))

vi.mock('../../../../src/app/tenant/tenant-side-effects', () => ({
    tenantSideEffects: () => ({ scheduleHardDelete: (...args: unknown[]) => scheduleHardDelete(...args) }),
}))

vi.mock('../../../../src/app/connection/connection-service/connection-service', () => ({ connectionService: () => ({}) }))
vi.mock('../../../../src/app/federation/external-identity.service', () => ({ externalIdentityService: () => ({}) }))
vi.mock('../../../../src/app/federation/member-subscription.service', () => ({ memberSubscriptionService: () => ({}) }))
vi.mock('../../../../src/app/helper/domain-helper', () => ({ domainHelper: {} }))
vi.mock('../../../../src/app/tenant/tenant-owner.service', () => ({ tenantOwnerService: () => ({}) }))
vi.mock('../../../../src/app/tenant/tenant.utils', () => ({ tenantUtils: {} }))

const log = Fastify({ logger: false }).log
const anyIssuerCaller: PlatformCaller = { clientId: 'c1', clientName: 'rental-saas', kind: PlatformClientKind.API_KEY, issuer: null, scopes: [PlatformScope.TENANT_PROVISION] }
const otherIssuerCaller: PlatformCaller = { clientId: 'c2', clientName: 'other', kind: PlatformClientKind.TRUSTED_ISSUER, issuer: 'https://other.example.com', scopes: [PlatformScope.TENANT_PROVISION] }
const provisionRequest = {
    externalRef: { issuer: 'https://iam.example.com', tenantId: 'T-1' },
    name: 'Northwind',
    owner: { email: 'owner@northwind.test' },
}

describe('platform tenant deletion', () => {
    beforeEach(() => {
        findOneBy.mockReset()
        getByExternalRef.mockReset()
        markDeleting.mockReset()
        rename.mockReset()
        ensureOwnerProject.mockReset()
        scheduleHardDelete.mockReset()
    })

    it('refuses to provision a tenant whose external reference is still being deleted', async () => {
        getByExternalRef.mockResolvedValue({ id: 't1', status: TenantStatus.DELETING, name: 'Northwind' })

        const provisioning = platformTenantService(log).provision({ request: provisionRequest, caller: anyIssuerCaller })

        await expect(provisioning).rejects.toMatchObject({ error: { code: ErrorCode.VALIDATION, params: { message: 'tenantIsBeingDeleted' } } })
        expect(rename).not.toHaveBeenCalled()
        expect(ensureOwnerProject).not.toHaveBeenCalled()
    })

    it('marks the tenant as deleting and queues the purge', async () => {
        findOneBy.mockResolvedValue({ id: 't1', externalIssuer: 'https://iam.example.com', status: TenantStatus.DELETING })
        markDeleting.mockResolvedValue({ id: 't1' })

        await platformTenantService(log).requestDeletion({ tenantId: 't1', caller: anyIssuerCaller })

        expect(markDeleting).toHaveBeenCalledWith({ tenantId: 't1' })
        expect(scheduleHardDelete).toHaveBeenCalledWith({ tenantId: 't1' })
    })

    it('answers not found, without marking or queuing anything, for a missing tenant', async () => {
        findOneBy.mockResolvedValue(null)

        const deletion = platformTenantService(log).requestDeletion({ tenantId: 'missing', caller: anyIssuerCaller })

        await expect(deletion).rejects.toMatchObject({ error: { code: ErrorCode.ENTITY_NOT_FOUND } })
        expect(markDeleting).not.toHaveBeenCalled()
        expect(scheduleHardDelete).not.toHaveBeenCalled()
    })

    it('answers not found for a tenant that belongs to another issuer', async () => {
        findOneBy.mockResolvedValue({ id: 't1', externalIssuer: 'https://iam.example.com', status: TenantStatus.ACTIVE })

        const deletion = platformTenantService(log).requestDeletion({ tenantId: 't1', caller: otherIssuerCaller })

        await expect(deletion).rejects.toMatchObject({ error: { code: ErrorCode.ENTITY_NOT_FOUND } })
        expect(markDeleting).not.toHaveBeenCalled()
        expect(scheduleHardDelete).not.toHaveBeenCalled()
    })
})
