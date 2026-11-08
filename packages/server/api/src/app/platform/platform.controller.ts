import { EntityId } from '@fema-ipaas/core-utils'
import {
    PlatformAddMemberRequestBody,
    PlatformMember,
    PlatformMemberRef,
    PlatformScope,
    PlatformTenant,
    PlatformUpdateTenantRequestBody,
    PlatformUsageQuery,
    PlatformUsageResponse,
    ProvisionTenantRequestBody,
    ProvisionTenantResponse,
    TenantExternalRef,
    TenantStatus,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { operatorAudit } from '../operator/operator-audit'
import { platformAuth } from './platform-auth'
import { platformMemberService } from './platform-member.service'
import { platformTenantService } from './platform-tenant.service'
import { platformUsageService } from './platform-usage.service'

export const platformController: FastifyPluginAsyncZod = async (app) => {
    app.post('/tenants', ProvisionRequest, async (request) => {
        const caller = platformAuth.callerOf({ request })
        const response = await platformTenantService(request.log).provision({ request: request.body, caller })
        operatorAudit.recordByPlatformClient({
            request,
            tenantId: response.tenantId,
            clientName: caller.clientName,
            operation: response.created ? 'provision.created' : 'provision.updated',
            target: request.body.name,
        })
        return response
    })

    app.get('/tenants/by-external-ref', ByExternalRefRequest, async (request) => {
        const caller = platformAuth.callerOf({ request })
        return platformTenantService(request.log).getByExternalRef({
            ref: { issuer: request.query.issuer, tenantId: request.query.tenantId },
            caller,
        })
    })

    app.get('/tenants/:id', TenantReadRequest, async (request) => {
        const caller = platformAuth.callerOf({ request })
        return platformTenantService(request.log).getOrThrow({ tenantId: request.params.id, caller })
    })

    app.post('/tenants/:id', TenantUpdateRequest, async (request) => {
        const caller = platformAuth.callerOf({ request })
        const tenant = await platformTenantService(request.log).update({ tenantId: request.params.id, caller, request: request.body })
        operatorAudit.recordByPlatformClient({ request, tenantId: tenant.id, clientName: caller.clientName, operation: 'tenant.updated', target: tenant.name })
        return tenant
    })

    app.post('/tenants/:id/suspend', TenantReadRequest, async (request) => {
        const caller = platformAuth.callerOf({ request })
        const tenant = await platformTenantService(request.log).setStatus({ tenantId: request.params.id, caller, status: TenantStatus.SUSPENDED })
        operatorAudit.recordByPlatformClient({ request, tenantId: tenant.id, clientName: caller.clientName, operation: 'tenant.suspended', target: tenant.name })
        return tenant
    })

    app.post('/tenants/:id/resume', TenantReadRequest, async (request) => {
        const caller = platformAuth.callerOf({ request })
        const tenant = await platformTenantService(request.log).setStatus({ tenantId: request.params.id, caller, status: TenantStatus.ACTIVE })
        operatorAudit.recordByPlatformClient({ request, tenantId: tenant.id, clientName: caller.clientName, operation: 'tenant.resumed', target: tenant.name })
        return tenant
    })

    app.delete('/tenants/:id', TenantDeleteRequest, async (request, reply) => {
        const caller = platformAuth.callerOf({ request })
        const tenant = await platformTenantService(request.log).requestDeletion({ tenantId: request.params.id, caller })
        return reply.status(StatusCodes.ACCEPTED).send(tenant)
    })

    app.get('/tenants/:id/members', MembersReadRequest, async (request) => {
        const caller = platformAuth.callerOf({ request })
        await platformTenantService(request.log).loadAccessibleTenant({ tenantId: request.params.id, caller })
        return platformMemberService(request.log).list({ tenantId: request.params.id })
    })

    app.post('/tenants/:id/members', MemberAddRequest, async (request) => {
        const caller = platformAuth.callerOf({ request })
        const tenant = await platformTenantService(request.log).loadAccessibleTenant({ tenantId: request.params.id, caller })
        const members = await platformMemberService(request.log).add({ tenantId: tenant.id, request: request.body })
        operatorAudit.recordByPlatformClient({
            request,
            tenantId: tenant.id,
            clientName: caller.clientName,
            operation: 'member.added',
            target: request.body.subject ?? request.body.email ?? request.body.phone ?? '',
        })
        return members
    })

    app.delete('/tenants/:id/members', MemberRemoveRequest, async (request, reply) => {
        const caller = platformAuth.callerOf({ request })
        const tenant = await platformTenantService(request.log).loadAccessibleTenant({ tenantId: request.params.id, caller })
        await platformMemberService(request.log).remove({ tenantId: tenant.id, ref: request.query })
        operatorAudit.recordByPlatformClient({
            request,
            tenantId: tenant.id,
            clientName: caller.clientName,
            operation: 'member.removed',
            target: request.query.subject ?? request.query.userId ?? '',
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.get('/usage', UsageRequest, async (request) => {
        const caller = platformAuth.callerOf({ request })
        return platformUsageService(request.log).query({ query: request.query, caller })
    })
}

const publicRoute = {
    security: securityAccess.public(),
}

const TenantIdParams = z.object({ id: EntityId })

const ProvisionRequest = {
    config: publicRoute,
    preHandler: platformAuth.preHandler(PlatformScope.TENANT_PROVISION),
    schema: {
        tags: ['platform'],
        body: ProvisionTenantRequestBody,
        response: { [StatusCodes.OK]: ProvisionTenantResponse },
    },
}

const ByExternalRefRequest = {
    config: publicRoute,
    preHandler: platformAuth.preHandler(PlatformScope.TENANT_PROVISION),
    schema: {
        tags: ['platform'],
        querystring: z.object({
            issuer: TenantExternalRef.shape.issuer,
            tenantId: TenantExternalRef.shape.tenantId,
        }),
        response: { [StatusCodes.OK]: PlatformTenant },
    },
}

const TenantReadRequest = {
    config: publicRoute,
    preHandler: platformAuth.preHandler(PlatformScope.TENANT_PROVISION),
    schema: {
        tags: ['platform'],
        params: TenantIdParams,
        response: { [StatusCodes.OK]: PlatformTenant },
    },
}

const TenantDeleteRequest = {
    config: publicRoute,
    preHandler: platformAuth.preHandler(PlatformScope.TENANT_PROVISION),
    schema: {
        tags: ['platform'],
        params: TenantIdParams,
        response: { [StatusCodes.ACCEPTED]: PlatformTenant },
    },
}

const TenantUpdateRequest = {
    config: publicRoute,
    preHandler: platformAuth.preHandler(PlatformScope.TENANT_PROVISION),
    schema: {
        tags: ['platform'],
        params: TenantIdParams,
        body: PlatformUpdateTenantRequestBody,
        response: { [StatusCodes.OK]: PlatformTenant },
    },
}

const MembersReadRequest = {
    config: publicRoute,
    preHandler: platformAuth.preHandler(PlatformScope.TENANT_MEMBERS),
    schema: {
        tags: ['platform'],
        params: TenantIdParams,
        response: { [StatusCodes.OK]: z.array(PlatformMember) },
    },
}

const MemberAddRequest = {
    config: publicRoute,
    preHandler: platformAuth.preHandler(PlatformScope.TENANT_MEMBERS),
    schema: {
        tags: ['platform'],
        params: TenantIdParams,
        body: PlatformAddMemberRequestBody,
        response: { [StatusCodes.OK]: z.array(PlatformMember) },
    },
}

const MemberRemoveRequest = {
    config: publicRoute,
    preHandler: platformAuth.preHandler(PlatformScope.TENANT_MEMBERS),
    schema: {
        tags: ['platform'],
        params: TenantIdParams,
        querystring: PlatformMemberRef,
    },
}

const UsageRequest = {
    config: publicRoute,
    preHandler: platformAuth.preHandler(PlatformScope.USAGE_READ),
    schema: {
        tags: ['platform'],
        querystring: PlatformUsageQuery,
        response: { [StatusCodes.OK]: PlatformUsageResponse },
    },
}
