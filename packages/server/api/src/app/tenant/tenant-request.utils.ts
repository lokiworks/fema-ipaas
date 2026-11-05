import { isNil } from '@fema-ipaas/core-utils'
import { SAAS_LIMITS } from '@fema-ipaas/shared'
import { z } from 'zod'

const QueryWithTenant = z.object({
    [SAAS_LIMITS.tenantQueryParam]: z.string().min(1).max(200).optional(),
})

function explicitTenantRef({ header, query }: { header: string | string[] | undefined, query: unknown }): string | null {
    const fromHeader = Array.isArray(header) ? header[0] : header
    if (!isNil(fromHeader) && fromHeader.trim().length > 0) {
        return fromHeader.trim()
    }
    const parsed = QueryWithTenant.safeParse(query)
    const fromQuery = parsed.success ? parsed.data[SAAS_LIMITS.tenantQueryParam] : undefined
    return isNil(fromQuery) || fromQuery.trim().length === 0 ? null : fromQuery.trim()
}

export const tenantRequestUtils = {
    explicitTenantRef,
}
