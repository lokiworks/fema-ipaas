import { EntityId, Nullable } from '@fema-ipaas/core-utils'
import {
    ApplicationEventName,
    CreatePlatformClientRequestBody,
    CreatePlatformClientResponse,
    GrantInstanceOperatorRequestBody,
    InstanceOperator,
    InstanceSettings,
    ListOperatorTenantsRequestQuery,
    OperatorCreateTenantRequestBody,
    OperatorCreateTenantResponse,
    OperatorTenantSummary,
    PlatformClient,
    PrincipalType,
    TenantLimitsUpdate,
    TenantStatus,
    UpdateInstanceSettingsRequestBody,
    UpdateTenantSlugRequestBody,
} from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { platformClientService } from '../platform/platform-client.service'
import { userService } from '../user/user-service'
import { instanceOperator } from './instance-operator'
import { instanceSettingsService } from './instance-settings.service'
import { operatorAudit } from './operator-audit'
import { operatorTenantService } from './operator-tenant.service'

export const operatorController: FastifyPluginAsyncZod = async (app) => {
    app.get('/tenants', ListTenantsRequest, async (request) => {
        return operatorTenantService(request.log).list(request.query)
    })

    app.get('/tenants/:id', TenantByIdRequest, async (request) => {
        return operatorTenantService(request.log).getSummaryOrThrow({ tenantId: request.params.id })
    })

    app.post('/tenants', CreateTenantRequest, async (request) => {
        const created = await operatorTenantService(request.log).create({ request: request.body })
        operatorAudit.recordByOperator({
            request,
            tenantId: created.tenant.id,
            action: ApplicationEventName.OPERATOR_TENANT_CREATED,
            target: created.tenant.name,
            detail: created.tenant.slug,
        })
        return created
    })

    app.post('/tenants/:id/suspend', TenantByIdRequest, async (request) => {
        const summary = await operatorTenantService(request.log).setStatus({ tenantId: request.params.id, status: TenantStatus.SUSPENDED })
        operatorAudit.recordByOperator({
            request,
            tenantId: summary.id,
            action: ApplicationEventName.OPERATOR_TENANT_STATUS_CHANGED,
            target: summary.name,
            detail: TenantStatus.SUSPENDED,
        })
        return summary
    })

    app.post('/tenants/:id/resume', TenantByIdRequest, async (request) => {
        const summary = await operatorTenantService(request.log).setStatus({ tenantId: request.params.id, status: TenantStatus.ACTIVE })
        operatorAudit.recordByOperator({
            request,
            tenantId: summary.id,
            action: ApplicationEventName.OPERATOR_TENANT_STATUS_CHANGED,
            target: summary.name,
            detail: TenantStatus.ACTIVE,
        })
        return summary
    })

    app.post('/tenants/:id/limits', UpdateLimitsRequest, async (request) => {
        const summary = await operatorTenantService(request.log).updateLimits({ tenantId: request.params.id, limits: request.body })
        operatorAudit.recordByOperator({
            request,
            tenantId: summary.id,
            action: ApplicationEventName.OPERATOR_TENANT_UPDATED,
            target: summary.name,
            detail: JSON.stringify(request.body),
        })
        return summary
    })

    app.post('/tenants/:id/slug', UpdateSlugRequest, async (request) => {
        const summary = await operatorTenantService(request.log).updateSlug({ tenantId: request.params.id, slug: request.body.slug })
        operatorAudit.recordByOperator({
            request,
            tenantId: summary.id,
            action: ApplicationEventName.TENANT_SLUG_CHANGED,
            target: summary.name,
            detail: summary.slug,
        })
        return summary
    })

    app.get('/operators', OperatorsRequest, async () => {
        return instanceOperator.list()
    })

    app.post('/operators', GrantOperatorRequest, async (request) => {
        const operators = await instanceOperator.grant({ email: request.body.email, log: request.log })
        operatorAudit.recordByOperator({
            request,
            action: ApplicationEventName.OPERATOR_INSTANCE_OPERATOR_CHANGED,
            target: request.body.email,
            detail: 'granted',
        })
        return operators
    })

    app.delete('/operators/:identityId', RevokeOperatorRequest, async (request) => {
        const operators = await instanceOperator.revoke({ identityId: request.params.identityId, log: request.log })
        operatorAudit.recordByOperator({
            request,
            action: ApplicationEventName.OPERATOR_INSTANCE_OPERATOR_CHANGED,
            target: request.params.identityId,
            detail: 'revoked',
        })
        return operators
    })

    app.get('/settings', InstanceSettingsRequest, async (request) => {
        return instanceSettingsService(request.log).get()
    })

    app.post('/settings', UpdateInstanceSettingsRequest, async (request) => {
        const settings = await instanceSettingsService(request.log).update({ patch: request.body })
        operatorAudit.recordByOperator({
            request,
            action: ApplicationEventName.OPERATOR_INSTANCE_SETTINGS_UPDATED,
            target: 'instance',
            detail: JSON.stringify(request.body),
        })
        return settings
    })

    app.get('/platform-clients', PlatformClientsRequest, async (request) => {
        return platformClientService(request.log).list()
    })

    app.post('/platform-clients', CreatePlatformClientRequest, async (request) => {
        const user = await userService(request.log).getOneOrFail({ id: request.principal.id })
        const created = await platformClientService(request.log).create({ request: request.body, createdByIdentityId: user.identityId })
        operatorAudit.recordByOperator({
            request,
            action: ApplicationEventName.OPERATOR_PLATFORM_CLIENT_CHANGED,
            target: created.client.name,
            detail: `issued ${created.client.kind}`,
        })
        return created
    })

    app.post('/platform-clients/:id/revoke', RevokePlatformClientRequest, async (request) => {
        const revoked = await platformClientService(request.log).revoke({ id: request.params.id })
        operatorAudit.recordByOperator({
            request,
            action: ApplicationEventName.OPERATOR_PLATFORM_CLIENT_CHANGED,
            target: revoked.name,
            detail: 'revoked',
        })
        return revoked
    })

    app.get('/me', MeRequest, async (request) => {
        return { isOperator: await instanceOperator.isOperatorRequest({ request }) }
    })
}

const operatorGuard = async (request: FastifyRequest): Promise<void> => {
    await instanceOperator.assert({ request })
}

const operatorConfig = {
    security: securityAccess.unscoped([PrincipalType.USER]),
}

const IdParams = z.object({ id: EntityId })

const TenantPage = z.object({
    data: z.array(OperatorTenantSummary),
    next: Nullable(z.string()),
    previous: Nullable(z.string()),
})

const ListTenantsRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        querystring: ListOperatorTenantsRequestQuery,
        response: { [StatusCodes.OK]: TenantPage },
    },
}

const TenantByIdRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        params: IdParams,
        response: { [StatusCodes.OK]: OperatorTenantSummary },
    },
}

const CreateTenantRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        body: OperatorCreateTenantRequestBody,
        response: { [StatusCodes.OK]: OperatorCreateTenantResponse },
    },
}

const UpdateLimitsRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        params: IdParams,
        body: TenantLimitsUpdate,
        response: { [StatusCodes.OK]: OperatorTenantSummary },
    },
}

const UpdateSlugRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        params: IdParams,
        body: UpdateTenantSlugRequestBody,
        response: { [StatusCodes.OK]: OperatorTenantSummary },
    },
}

const OperatorsRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        response: { [StatusCodes.OK]: z.array(InstanceOperator) },
    },
}

const GrantOperatorRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        body: GrantInstanceOperatorRequestBody,
        response: { [StatusCodes.OK]: z.array(InstanceOperator) },
    },
}

const RevokeOperatorRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        params: z.object({ identityId: EntityId }),
        response: { [StatusCodes.OK]: z.array(InstanceOperator) },
    },
}

const InstanceSettingsRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        response: { [StatusCodes.OK]: InstanceSettings },
    },
}

const UpdateInstanceSettingsRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        body: UpdateInstanceSettingsRequestBody,
        response: { [StatusCodes.OK]: InstanceSettings },
    },
}

const PlatformClientsRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        response: { [StatusCodes.OK]: z.array(PlatformClient) },
    },
}

const CreatePlatformClientRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        body: CreatePlatformClientRequestBody,
        response: { [StatusCodes.OK]: CreatePlatformClientResponse },
    },
}

const RevokePlatformClientRequest = {
    config: operatorConfig,
    preHandler: operatorGuard,
    schema: {
        tags: ['operator'],
        params: IdParams,
        response: { [StatusCodes.OK]: PlatformClient },
    },
}

const MeRequest = {
    config: operatorConfig,
    schema: {
        tags: ['operator'],
        response: { [StatusCodes.OK]: z.object({ isOperator: z.boolean() }) },
    },
}
