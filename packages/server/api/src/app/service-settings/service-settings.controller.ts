import { OptionalServiceKind, PrincipalType, SaveServiceSettingResponse, ServiceCheckFailure, ServiceCheckResult, ServiceSettingDraft, ServiceSettingsOverview, ServiceSettingView, TestServiceSettingRequest } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { authnRateLimit } from '../core/security/rate-limit'
import { serviceCheckService } from '../health/service-check.service'
import { instanceOperator } from '../operator/instance-operator'
import { instanceScope } from '../operator/instance-scope'
import { tenantService } from '../tenant/tenant.service'
import { serviceSettingsService } from './service-settings.service'

export const serviceSettingsController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<ServiceSettingsOverview> => {
        await instanceOperator.assert({ request })
        return serviceSettingsService(request.log).list({ tenantId: await instanceScope.requireTenantId() })
    })

    app.post('/', SaveRequest, async (request): Promise<SaveServiceSettingResponse> => {
        await instanceOperator.assert({ request })
        return serviceSettingsService(request.log).save({ tenantId: await instanceScope.requireTenantId(), userId: request.principal.id, draft: request.body })
    })

    app.post('/test', TestRequest, async (request): Promise<ServiceCheckResult> => {
        await instanceOperator.assert({ request })
        const tenantId = await instanceScope.requireTenantId()
        const candidate = await serviceSettingsService(request.log).resolveCandidate({ tenantId, draft: request.body.draft })
        if ('error' in candidate) {
            return { kind: request.body.draft.kind, ok: false, failure: ServiceCheckFailure.REJECTED, reason: candidate.error, sentTo: null, checkedAt: new Date().toISOString() }
        }
        const tenant = await tenantService(request.log).getOneOrThrow(tenantId)
        return serviceCheckService(request.log).checkCandidate({ candidate, recipient: request.body.recipient, tenantName: tenant.name })
    })

    app.delete('/:kind', ClearRequest, async (request): Promise<ServiceSettingView> => {
        await instanceOperator.assert({ request })
        return serviceSettingsService(request.log).clear({ tenantId: await instanceScope.requireTenantId(), kind: request.params.kind })
    })
}

const adminOnly = {
    security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
}

const ListRequest = {
    config: adminOnly,
    schema: { tags: ['service-settings'], response: { [StatusCodes.OK]: ServiceSettingsOverview } },
}

const SaveRequest = {
    config: { ...adminOnly, rateLimit: authnRateLimit },
    schema: {
        tags: ['service-settings'],
        description: 'Checks the optional service with the given settings and saves them only when the check passes. Environment variables take priority over saved settings',
        body: ServiceSettingDraft,
        response: { [StatusCodes.OK]: SaveServiceSettingResponse },
    },
}

const TestRequest = {
    config: { ...adminOnly, rateLimit: authnRateLimit },
    schema: {
        tags: ['service-settings'],
        description: 'Tests settings that are not saved yet. Sends a test email when a recipient is given',
        body: TestServiceSettingRequest,
        response: { [StatusCodes.OK]: ServiceCheckResult },
    },
}

const ClearRequest = {
    config: adminOnly,
    schema: {
        tags: ['service-settings'],
        params: z.object({ kind: z.enum(OptionalServiceKind) }),
        response: { [StatusCodes.OK]: ServiceSettingView },
    },
}
