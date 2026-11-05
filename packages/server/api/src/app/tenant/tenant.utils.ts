import { ApplicationError, ErrorCode, isNil, TenantId, tryCatch } from '@fema-ipaas/core-utils'
import { PrincipalType, SAAS_LIMITS } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { databaseConnection } from '../database/database-connection'
import { domainHelper } from '../helper/domain-helper'
import { networkUtils } from '../helper/network-utils'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { tenantDomainService } from '../tenant-domain/tenant-domain.service'
import { tenantDomainUtils } from '../tenant-domain/tenant-domain.utils'
import { tenantRequestUtils } from './tenant-request.utils'
import { tenantService } from './tenant.service'

async function resolveByHost({ req }: { req: FastifyRequest }): Promise<TenantId | null> {
    const rawHost = networkUtils.getRequestHost(req)
    if (isNil(rawHost) || rawHost.length === 0) {
        return null
    }
    const host = tenantDomainUtils.hostWithoutPort({ host: rawHost })
    const frontendHost = tenantDomainUtils.hostOfUrl({ url: system.getOrThrow(AppSystemProp.FRONTEND_URL) })
    if (host === frontendHost) {
        return null
    }
    const verifiedHostTenantId = await tenantDomainService(req.log).findTenantIdForHost({ host })
    if (!isNil(verifiedHostTenantId)) {
        return verifiedHostTenantId
    }
    const slug = tenantDomainUtils.subdomainSlug({ host, baseDomain: system.get(AppSystemProp.TENANT_BASE_DOMAIN) })
    if (isNil(slug)) {
        return null
    }
    const tenant = await tenantService(req.log).getBySlug(slug)
    return tenant?.id ?? null
}

async function resolveExplicit({ req, ref }: { req: FastifyRequest, ref: string }): Promise<TenantId> {
    const tenant = await tenantService(req.log).getBySlugOrId(ref)
    if (isNil(tenant)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityType: 'tenant', entityId: ref },
        })
    }
    return tenant.id
}

export const tenantUtils = {
    async getTenantIdForRequest(req: FastifyRequest): Promise<TenantId | null> {
        if (
            req.principal
            && req.principal.type !== PrincipalType.UNKNOWN
            && req.principal.type !== PrincipalType.WORKER
            && req.principal.type !== PrincipalType.ONBOARDING
        ) {
            return req.principal.tenant.id
        }
        const ref = tenantRequestUtils.explicitTenantRef({ header: req.headers[SAAS_LIMITS.tenantHeader], query: req.query })
        if (!isNil(ref)) {
            return resolveExplicit({ req, ref })
        }
        const byHost = await resolveByHost({ req })
        if (!isNil(byHost)) {
            return byHost
        }
        return tenantService(req.log).getOnlyTenantId()
    },

    async getPublicTenantUrl({ slug }: { slug: string }): Promise<string> {
        const baseDomain = system.get(AppSystemProp.TENANT_BASE_DOMAIN)
        if (!isNil(baseDomain) && baseDomain.trim().length > 0) {
            const frontend = new URL(system.getOrThrow(AppSystemProp.FRONTEND_URL))
            return `${frontend.protocol}//${slug}.${baseDomain.trim()}${frontend.port.length > 0 ? `:${frontend.port}` : ''}`
        }
        return domainHelper.getPublicUrl({ path: `${SAAS_LIMITS.tenantPathPrefix}${slug}` })
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
