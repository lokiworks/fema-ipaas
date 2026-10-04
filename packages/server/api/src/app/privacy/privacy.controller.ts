import { ApplicationEventName, ConfirmDataErasureRequestBody, CreateDataErasureRequestBody, DataErasureReceipt, DataErasureRequest, PrincipalType, PrivacyOverview, PrivacySettings, UpdatePrivacySettingsRequestBody } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { dataErasureService } from './data-erasure.service'
import { privacyOverviewService } from './privacy-overview.service'
import { privacyService } from './privacy.service'

export const privacyController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', GetRequest, async (request): Promise<PrivacySettings> => {
        return privacyService(request.log).get({ tenantId: request.principal.tenant.id })
    })

    app.post('/', UpdateRequest, async (request): Promise<PrivacySettings> => {
        const settings = await privacyService(request.log).update({ tenantId: request.principal.tenant.id, request: request.body })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.PRIVACY_SETTINGS_UPDATED,
            data: { logRetentionDays: settings.logRetentionDays, payloadLevel: settings.payloadLevel },
        })
        return settings
    })

    app.get('/overview', OverviewRequest, async (request): Promise<PrivacyOverview> => {
        return privacyOverviewService(request.log).get({ tenantId: request.principal.tenant.id })
    })

    app.get('/erasures', ListErasuresRequest, async (request): Promise<DataErasureRequest[]> => {
        return dataErasureService(request.log).list({ tenantId: request.principal.tenant.id })
    })

    app.post('/erasures', CreateErasureRequest, async (request, reply) => {
        const created = await dataErasureService(request.log).create({ tenantId: request.principal.tenant.id, userId: request.principal.id, request: request.body })
        auditErasure({ request, erasure: created, phase: 'REQUESTED' })
        await reply.status(StatusCodes.CREATED).send(created)
    })

    app.post('/erasures/:id/confirm', ConfirmErasureRequest, async (request): Promise<DataErasureRequest> => {
        const confirmed = await dataErasureService(request.log).confirm({ id: request.params.id, tenantId: request.principal.tenant.id, userId: request.principal.id, request: request.body })
        auditErasure({ request, erasure: confirmed, phase: 'CONFIRMED' })
        return confirmed
    })

    app.get('/erasures/:id/receipt', ReceiptRequest, async (request): Promise<DataErasureReceipt> => {
        const service = dataErasureService(request.log)
        const receipt = await service.receipt({ id: request.params.id, tenantId: request.principal.tenant.id })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.PERSONAL_DATA_ERASURE,
            data: {
                request: { id: receipt.requestId, kind: receipt.lookup, valueHint: receipt.valueHint, reason: receipt.reason },
                phase: 'RECEIPT_DOWNLOADED',
                matchedRuns: receipt.matchedRuns,
            },
        })
        return receipt
    })

    app.post('/erasures/:id/cancel', ErasureActionRequest, async (request): Promise<DataErasureRequest> => {
        const canceled = await dataErasureService(request.log).cancel({ id: request.params.id, tenantId: request.principal.tenant.id })
        auditErasure({ request, erasure: canceled, phase: 'CANCELED' })
        return canceled
    })
}

function auditErasure({ request, erasure, phase }: { request: FastifyRequest, erasure: DataErasureRequest, phase: 'REQUESTED' | 'CONFIRMED' | 'CANCELED' }): void {
    applicationEvents(request.log).sendUserEvent(request, {
        action: ApplicationEventName.PERSONAL_DATA_ERASURE,
        data: {
            request: { id: erasure.id, kind: erasure.kind, valueHint: erasure.valueHint, reason: erasure.reason },
            phase,
            matchedRuns: erasure.matchedRuns,
        },
    })
}

const ListErasuresRequest = {
    config: { security: securityAccess.tenantAdminOnly([PrincipalType.USER]) },
    schema: { tags: ['privacy'], response: { 200: z.array(DataErasureRequest) } },
}

const CreateErasureRequest = {
    config: { security: securityAccess.tenantAdminOnly([PrincipalType.USER]) },
    schema: { tags: ['privacy'], body: CreateDataErasureRequestBody, response: { 201: DataErasureRequest } },
}

const ConfirmErasureRequest = {
    config: { security: securityAccess.tenantAdminOnly([PrincipalType.USER]) },
    schema: { tags: ['privacy'], params: z.object({ id: z.string() }), body: ConfirmDataErasureRequestBody, response: { 200: DataErasureRequest } },
}

const ReceiptRequest = {
    config: { security: securityAccess.tenantAdminOnly([PrincipalType.USER]) },
    schema: { tags: ['privacy'], params: z.object({ id: z.string() }), response: { 200: DataErasureReceipt } },
}

const ErasureActionRequest = {
    config: { security: securityAccess.tenantAdminOnly([PrincipalType.USER]) },
    schema: { tags: ['privacy'], params: z.object({ id: z.string() }), response: { 200: DataErasureRequest } },
}

const OverviewRequest = {
    config: { security: securityAccess.tenantAdminOnly([PrincipalType.USER]) },
    schema: { tags: ['privacy'], response: { 200: PrivacyOverview } },
}

const GetRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['privacy'], response: { 200: PrivacySettings } },
}

const UpdateRequest = {
    config: { security: securityAccess.tenantAdminOnly([PrincipalType.USER]) },
    schema: { tags: ['privacy'], body: UpdatePrivacySettingsRequestBody, response: { 200: PrivacySettings } },
}
