import { ErrorCode } from '@fema-ipaas/core-utils'
import { StatusCodes } from 'http-status-codes'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webhookTenantGate } from '../../../../src/app/webhooks/webhook-tenant-gate'

const isActive = vi.fn()

vi.mock('../../../../src/app/tenant/tenant-status-guard', () => ({
    tenantStatusGuard: { isActive: (params: unknown) => isActive(params) },
}))

describe('webhook tenant gate', () => {
    beforeEach(() => {
        isActive.mockReset()
    })

    it('refuses a webhook of a suspended tenant with 403 and the tenant suspended code', async () => {
        isActive.mockResolvedValue(false)

        const refusal = await webhookTenantGate.refusalFor({ tenantId: 't1', webhookHeader: 'x-webhook-id', webhookRequestId: 'req-1' })

        expect(refusal).toEqual({
            status: StatusCodes.FORBIDDEN,
            body: { code: ErrorCode.TENANT_SUSPENDED },
            headers: { 'x-webhook-id': 'req-1' },
        })
        expect(webhookTenantGate.isRefusal(refusal)).toBe(true)
    })

    it('does not refuse a webhook of an active tenant', async () => {
        isActive.mockResolvedValue(true)

        const refusal = await webhookTenantGate.refusalFor({ tenantId: 't1', webhookHeader: 'x-webhook-id', webhookRequestId: 'req-1' })

        expect(refusal).toBeNull()
        expect(webhookTenantGate.isRefusal(refusal)).toBe(false)
    })

    it('does not leak the tenant id to the caller', async () => {
        isActive.mockResolvedValue(false)

        const refusal = await webhookTenantGate.refusalFor({ tenantId: 'secret-tenant-id', webhookHeader: 'x-webhook-id', webhookRequestId: 'req-1' })

        expect(JSON.stringify(refusal)).not.toContain('secret-tenant-id')
    })
})
