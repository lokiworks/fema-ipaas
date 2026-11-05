import { EntityId } from '@fema-ipaas/core-utils'
import { ApplicationEventName, CreateTenantDomainRequestBody, PrincipalType, TenantDomain } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { tenantDomainService } from './tenant-domain.service'

export const tenantDomainController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request) => {
        return tenantDomainService(request.log).list({ tenantId: request.principal.tenant.id })
    })

    app.post('/', CreateRequest, async (request) => {
        const domain = await tenantDomainService(request.log).add({
            tenantId: request.principal.tenant.id,
            domain: request.body.domain,
            purpose: request.body.purpose,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.TENANT_DOMAIN_CHANGED,
            data: { target: domain.domain, detail: `added ${domain.purpose}` },
        })
        return domain
    })

    app.post('/:id/verify', VerifyRequest, async (request) => {
        const domain = await tenantDomainService(request.log).verify({
            tenantId: request.principal.tenant.id,
            id: request.params.id,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.TENANT_DOMAIN_CHANGED,
            data: { target: domain.domain, detail: `verified ${domain.purpose}` },
        })
        return domain
    })

    app.delete('/:id', IdRequest, async (request, reply) => {
        const domain = await tenantDomainService(request.log).remove({
            tenantId: request.principal.tenant.id,
            id: request.params.id,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.TENANT_DOMAIN_CHANGED,
            data: { target: domain.domain, detail: `removed ${domain.purpose}` },
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const adminOnly = {
    security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
}

const ListRequest = {
    config: adminOnly,
    schema: {
        tags: ['tenant-domains'],
        response: { [StatusCodes.OK]: z.array(TenantDomain) },
    },
}

const CreateRequest = {
    config: adminOnly,
    schema: {
        tags: ['tenant-domains'],
        body: CreateTenantDomainRequestBody,
        response: { [StatusCodes.OK]: TenantDomain },
    },
}

const IdRequest = {
    config: adminOnly,
    schema: {
        tags: ['tenant-domains'],
        params: z.object({ id: EntityId }),
    },
}

const VerifyRequest = {
    config: adminOnly,
    schema: {
        tags: ['tenant-domains'],
        params: z.object({ id: EntityId }),
        response: { [StatusCodes.OK]: TenantDomain },
    },
}
