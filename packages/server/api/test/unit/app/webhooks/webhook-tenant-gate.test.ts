import { ErrorCode } from '@fema-ipaas/core-utils'
import { StatusCodes } from 'http-status-codes'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webhookTenantGate } from '../../../../src/app/webhooks/webhook-tenant-gate'

const standingOf = vi.fn()

vi.mock('../../../../src/app/tenant/tenant-status-guard', () => ({
    tenantStatusGuard: { standingOf: (params: unknown) => standingOf(params) },
}))

describe('webhook tenant gate', () => {
    beforeEach(() => {
        standingOf.mockReset()
    })

    it('refuses a webhook of a suspended tenant with 403 and the tenant suspended code', async () => {
        standingOf.mockResolvedValue('BLOCKED')

        const refusal = await webhookTenantGate.refusalFor({ tenantId: 't1', webhookHeader: 'x-webhook-id', webhookRequestId: 'req-1' })

        expect(refusal).toEqual({
            status: StatusCodes.FORBIDDEN,
            body: { code: ErrorCode.TENANT_SUSPENDED },
            headers: { 'x-webhook-id': 'req-1' },
        })
        expect(webhookTenantGate.isRefusal(refusal)).toBe(true)
        expect(webhookTenantGate.isTenantGone(refusal)).toBe(false)
    })

    it('answers a webhook of a tenant that no longer exists like one of a workflow that does not exist', async () => {
        standingOf.mockResolvedValue('GONE')

        const refusal = await webhookTenantGate.refusalFor({ tenantId: 't1', webhookHeader: 'x-webhook-id', webhookRequestId: 'req-1' })

        expect(refusal).toEqual({
            status: StatusCodes.GONE,
            body: {},
            headers: { 'x-webhook-id': 'req-1' },
        })
        expect(webhookTenantGate.isTenantGone(refusal)).toBe(true)
    })

    it('does not refuse a webhook of an active tenant', async () => {
        standingOf.mockResolvedValue('ACTIVE')

        const refusal = await webhookTenantGate.refusalFor({ tenantId: 't1', webhookHeader: 'x-webhook-id', webhookRequestId: 'req-1' })

        expect(refusal).toBeNull()
        expect(webhookTenantGate.isRefusal(refusal)).toBe(false)
    })

    it('does not leak the tenant id to the caller', async () => {
        standingOf.mockResolvedValue('BLOCKED')

        const refusal = await webhookTenantGate.refusalFor({ tenantId: 'secret-tenant-id', webhookHeader: 'x-webhook-id', webhookRequestId: 'req-1' })

        expect(JSON.stringify(refusal)).not.toContain('secret-tenant-id')
    })
})
