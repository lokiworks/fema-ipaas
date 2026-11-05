import { TenantStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { createMockTenant } from '../../../helpers/mocks'
import { operatorTenantUtils } from '../../../../src/app/operator/operator-tenant.utils'

const tenant = {
    ...createMockTenant({ id: 'tenant-1', name: 'Acme', slug: 'acme' }),
    usersLimit: 10,
    projectsLimit: null,
    activeWorkflowsLimit: 50,
    concurrentExecutionsLimit: 5,
    workerGroupId: null,
}

describe('operator tenant utils', () => {
    it('summarises a tenant with its counts, limits and owner', () => {
        const summary = operatorTenantUtils.toSummary({
            tenant,
            usersCount: 3,
            projectsCount: 2,
            activeWorkflowsCount: 7,
            owner: { name: 'Li Lei', contact: 'li@acme.com' },
        })

        expect(summary).toMatchObject({
            id: 'tenant-1',
            slug: 'acme',
            status: TenantStatus.ACTIVE,
            externalRef: null,
            ownerName: 'Li Lei',
            ownerContact: 'li@acme.com',
            usersCount: 3,
            projectsCount: 2,
            activeWorkflowsCount: 7,
            usersLimit: 10,
            projectsLimit: null,
            activeWorkflowsLimit: 50,
            concurrentExecutionsLimit: 5,
        })
    })

    it('reports the external reference only when both halves are present', () => {
        expect(operatorTenantUtils.externalRefOf({ tenant: { ...tenant, externalIssuer: 'https://iam.example.com', externalTenantId: 'T1' } }))
            .toEqual({ issuer: 'https://iam.example.com', tenantId: 'T1' })
        expect(operatorTenantUtils.externalRefOf({ tenant: { ...tenant, externalIssuer: 'https://iam.example.com' } })).toBeNull()
    })

    it('leaves the owner empty when it cannot be found', () => {
        const summary = operatorTenantUtils.toSummary({ tenant, usersCount: 0, projectsCount: 0, activeWorkflowsCount: 0, owner: null })

        expect(summary.ownerName).toBe('')
        expect(summary.ownerContact).toBeNull()
    })

    it('invites an email owner through the login address with the address prefilled', () => {
        expect(operatorTenantUtils.invitationUrl({ loginUrl: 'https://x.test/t/acme', owner: { email: 'li@acme.com' } }))
            .toBe('https://x.test/t/acme?email=li%40acme.com')
    })

    it('invites a phone owner through the login address with the number prefilled', () => {
        expect(operatorTenantUtils.invitationUrl({ loginUrl: 'https://x.test/t/acme', owner: { phone: '+8613800000000' } }))
            .toBe('https://x.test/t/acme?phone=%2B8613800000000')
    })

    it('has no invitation url for an owner that signs in through the identity provider', () => {
        expect(operatorTenantUtils.invitationUrl({ loginUrl: 'https://x.test/t/acme', owner: { subject: 'member-1' } })).toBeNull()
    })
})
