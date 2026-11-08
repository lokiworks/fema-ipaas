import { ErrorCode } from '@fema-ipaas/core-utils'
import { TenantStatus } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tenantStatusGuard } from '../../../../src/app/tenant/tenant-status-guard'

const findOne = vi.fn()

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({ findOne }),
}))

describe('tenant status guard', () => {
    beforeEach(() => {
        findOne.mockReset()
        tenantStatusGuard.clear()
    })

    it('lets an active tenant through', async () => {
        findOne.mockResolvedValue({ id: 't1', status: TenantStatus.ACTIVE })

        await expect(tenantStatusGuard.assertActive({ tenantId: 't1' })).resolves.toBeUndefined()
        expect(await tenantStatusGuard.isActive({ tenantId: 't1' })).toBe(true)
    })

    it('turns away a suspended tenant with the tenant suspended error', async () => {
        findOne.mockResolvedValue({ id: 't1', status: TenantStatus.SUSPENDED })

        await expect(tenantStatusGuard.assertActive({ tenantId: 't1' })).rejects.toMatchObject({
            error: { code: ErrorCode.TENANT_SUSPENDED, params: { tenantId: 't1' } },
        })
        expect(await tenantStatusGuard.isActive({ tenantId: 't1' })).toBe(false)
    })

    it('turns away a tenant that is being deleted exactly like a suspended one', async () => {
        findOne.mockResolvedValue({ id: 't1', status: TenantStatus.DELETING })

        await expect(tenantStatusGuard.assertActive({ tenantId: 't1' })).rejects.toMatchObject({
            error: { code: ErrorCode.TENANT_SUSPENDED, params: { tenantId: 't1' } },
        })
        expect(await tenantStatusGuard.isActive({ tenantId: 't1' })).toBe(false)
    })

    it('blocks a tenant that is deleting as soon as the cache entry of its former active status is invalidated', async () => {
        findOne.mockResolvedValueOnce({ id: 't1', status: TenantStatus.ACTIVE })
        await tenantStatusGuard.assertActive({ tenantId: 't1' })

        findOne.mockResolvedValueOnce({ id: 't1', status: TenantStatus.DELETING })
        tenantStatusGuard.invalidate({ tenantId: 't1' })

        expect(await tenantStatusGuard.isActive({ tenantId: 't1' })).toBe(false)
    })

    it('does not block an unknown tenant, that is for other checks to reject', async () => {
        findOne.mockResolvedValue(null)

        await expect(tenantStatusGuard.assertActive({ tenantId: 'missing' })).resolves.toBeUndefined()
    })

    it('tells an active, a blocked and a purged tenant apart', async () => {
        findOne.mockResolvedValueOnce({ id: 't1', status: TenantStatus.ACTIVE })
        findOne.mockResolvedValueOnce({ id: 't2', status: TenantStatus.DELETING })
        findOne.mockResolvedValueOnce(null)

        expect(await tenantStatusGuard.standingOf({ tenantId: 't1' })).toBe('ACTIVE')
        expect(await tenantStatusGuard.standingOf({ tenantId: 't2' })).toBe('BLOCKED')
        expect(await tenantStatusGuard.standingOf({ tenantId: 'purged' })).toBe('GONE')
    })

    it('asks the database once while the answer is cached', async () => {
        findOne.mockResolvedValue({ id: 't1', status: TenantStatus.ACTIVE })

        await tenantStatusGuard.assertActive({ tenantId: 't1' })
        await tenantStatusGuard.assertActive({ tenantId: 't1' })

        expect(findOne).toHaveBeenCalledTimes(1)
    })

    it('sees a status change straight away once the cache entry is invalidated', async () => {
        findOne.mockResolvedValueOnce({ id: 't1', status: TenantStatus.ACTIVE })
        await tenantStatusGuard.assertActive({ tenantId: 't1' })

        findOne.mockResolvedValueOnce({ id: 't1', status: TenantStatus.SUSPENDED })
        tenantStatusGuard.invalidate({ tenantId: 't1' })

        await expect(tenantStatusGuard.assertActive({ tenantId: 't1' })).rejects.toBeDefined()
    })
})
