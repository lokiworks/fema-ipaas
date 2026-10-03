import { ApplicationError, ErrorCode, isNil, TenantId, tryCatch } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { databaseConnection } from '../database/database-connection'
import { networkUtils } from '../helper/network-utils'
import { tenantService } from './tenant.service'

export const tenantUtils = {
    async assertPrimaryTenant({ request }: { request: FastifyRequest }): Promise<void> {
        const primary = await tenantService(request.log).getOldestTenant()
        const tenantId = request.principal.type === PrincipalType.USER ? request.principal.tenant.id : null
        if (isNil(primary) || primary.id !== tenantId) {
            throw new ApplicationError({
                code: ErrorCode.AUTHORIZATION,
                params: { message: 'This setting is shared by the whole instance and can only be managed from the primary tenant' },
            })
        }
    },

    async getTenantIdForRequest(req: FastifyRequest): Promise<TenantId | null> {
        if (
            req.principal
            && req.principal.type !== PrincipalType.UNKNOWN
            && req.principal.type !== PrincipalType.WORKER
            && req.principal.type !== PrincipalType.ONBOARDING
        ) {
            return req.principal.tenant.id
        }
        const oldestTenant = await tenantService(req.log).getOldestTenant()
        return oldestTenant?.id ?? null
    },

    // temporary helper for sso customers until they update the acs url in saml
    async getTenantIdByLegacyHost(req: FastifyRequest): Promise<TenantId | null> {
        const host = networkUtils.getRequestHost(req)
        if (isNil(host) || host.length === 0) {
            return null
        }
        const { data, error } =  await tryCatch(() => databaseConnection().query<Array<{ tenant_id: string }>>(
            'SELECT tenant_id FROM legacy_custom_domain WHERE domain = $1 LIMIT 1',
            [host.toLowerCase()],
        ))
        if (error) return null
        return data[0]?.tenant_id ?? null
    },
    async getLegacyHostByTenantId(tenantId: string): Promise<string | null> {
        const { data, error } =  await tryCatch(() => databaseConnection().query<Array<{ domain: string }>>(
            'SELECT domain FROM legacy_custom_domain WHERE tenant_id = $1 LIMIT 1',
            [tenantId],
        ))
        if (error) return null
        return data[0]?.domain ?? null
    },
}
