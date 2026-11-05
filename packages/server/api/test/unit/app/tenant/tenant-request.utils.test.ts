import { describe, expect, it } from 'vitest'
import { tenantRequestUtils } from '../../../../src/app/tenant/tenant-request.utils'

describe('tenant request utils', () => {
    it('prefers the tenant header over the query parameter', () => {
        expect(tenantRequestUtils.explicitTenantRef({ header: 'acme', query: { tenant: 'other' } })).toBe('acme')
    })

    it('falls back to the tenant query parameter', () => {
        expect(tenantRequestUtils.explicitTenantRef({ header: undefined, query: { tenant: ' other ' } })).toBe('other')
    })

    it('reads the first value of a repeated header', () => {
        expect(tenantRequestUtils.explicitTenantRef({ header: ['first', 'second'], query: {} })).toBe('first')
    })

    it('ignores blank hints and malformed queries', () => {
        expect(tenantRequestUtils.explicitTenantRef({ header: '  ', query: { tenant: '' } })).toBeNull()
        expect(tenantRequestUtils.explicitTenantRef({ header: undefined, query: 'tenant=acme' })).toBeNull()
        expect(tenantRequestUtils.explicitTenantRef({ header: undefined, query: { tenant: 42 } })).toBeNull()
    })
})
