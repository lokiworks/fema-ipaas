import { EntityId } from '@fema-ipaas/core-utils'
import {
    BlueprintDebugResult,
    BlueprintPerson,
    BlueprintProjectOption,
    BlueprintTestResult,
    ChangeBlueprintVersionStatusRequest,
    ConnectorBlueprintDetail,
    ConnectorBlueprintSummary,
    CreateConnectorBlueprintRequest,
    DebugBlueprintOperationRequest,
    ImportOpenApiBlueprintRequest,
    ListConnectorBlueprintsQuery,
    OpenApiBlueprintPreview,
    PreviewOpenApiBlueprintRequest,
    PrincipalType,
    PublishConnectorBlueprintRequest,
    RunBlueprintAuthTestRequest,
    SaveBlueprintAuthTestDataRequest,
    SaveBlueprintDebugRecordRequest,
    TenantModule,
    TransferBlueprintOwnershipRequest,
    UpdateBlueprintCanaryRequest,
    UpdateBlueprintCollaboratorsRequest,
    UpdateConnectorBlueprintRequest,
} from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { tenantModuleGuard } from '../../tenant-access/tenant-module-guard'
import { blueprintAccess, BlueprintActor } from './connector-blueprint-common'
import { connectorBlueprintDevService } from './connector-blueprint-dev.service'
import { connectorBlueprintPublishService } from './connector-blueprint-publish.service'
import { connectorBlueprintService } from './connector-blueprint.service'

export const connectorBlueprintController: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preHandler', tenantModuleGuard.requireModule(TenantModule.CONNECTOR_DEVELOPMENT))

    app.get('/', ListRequest, async (request): Promise<ConnectorBlueprintSummary[]> => {
        return connectorBlueprintService(request.log).list({ actor: await actorOf(request), filter: request.query.filter })
    })

    app.post('/', CreateRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintService(request.log).create({ actor: await actorOf(request), request: request.body })
    })

    app.post('/openapi/preview', PreviewRequest, async (request): Promise<OpenApiBlueprintPreview> => {
        const actor = await actorOf(request)
        const service = connectorBlueprintService(request.log)
        return service.previewOpenApi({ document: request.body.document, takenIdentifiers: await service.takenIdentifiers(actor.tenantId) })
    })

    app.post('/openapi/import', ImportRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintService(request.log).importOpenApi({ actor: await actorOf(request), request: request.body })
    })

    app.get('/:id', IdRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintService(request.log).detail({ id: request.params.id, actor: await actorOf(request) })
    })

    app.post('/:id', UpdateRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintService(request.log).saveDefinition({ id: request.params.id, actor: await actorOf(request), definition: request.body.definition })
    })

    app.delete('/:id', IdRequest, async (request, reply) => {
        await connectorBlueprintService(request.log).delete({ id: request.params.id, actor: await actorOf(request) })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })

    app.post('/:id/collaborators', CollaboratorsRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintService(request.log).updateCollaborators({ id: request.params.id, actor: await actorOf(request), collaboratorIds: request.body.collaboratorIds })
    })

    app.post('/:id/owner', OwnerRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintService(request.log).transferOwnership({ id: request.params.id, actor: await actorOf(request), ownerId: request.body.ownerId })
    })

    app.get('/:id/candidates', IdRequest, async (request): Promise<BlueprintPerson[]> => {
        return connectorBlueprintService(request.log).candidates({ id: request.params.id, actor: await actorOf(request) })
    })

    app.get('/:id/projects', IdRequest, async (request): Promise<BlueprintProjectOption[]> => {
        return connectorBlueprintService(request.log).projects({ id: request.params.id, actor: await actorOf(request) })
    })

    app.post('/:id/auth/test-data', TestDataRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintDevService(request.log).saveTestData({ id: request.params.id, actor: await actorOf(request), values: request.body.values })
    })

    app.post('/:id/auth/test', AuthTestRequest, async (request): Promise<BlueprintTestResult> => {
        return connectorBlueprintDevService(request.log).runAuthTest({ id: request.params.id, actor: await actorOf(request), request: request.body })
    })

    app.post('/:id/auth/publish', IdRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintDevService(request.log).publishAuth({ id: request.params.id, actor: await actorOf(request) })
    })

    app.post('/:id/debug', DebugRequest, async (request): Promise<BlueprintDebugResult> => {
        return connectorBlueprintDevService(request.log).debug({ id: request.params.id, actor: await actorOf(request), request: request.body })
    })

    app.post('/:id/debug-records', DebugRecordRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintDevService(request.log).saveDebugRecord({ id: request.params.id, actor: await actorOf(request), request: request.body })
    })

    app.post('/:id/publish', PublishRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintPublishService(request.log).publish({ id: request.params.id, actor: await actorOf(request), request: request.body })
    })

    app.post('/:id/versions/:versionId/status', VersionStatusRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintPublishService(request.log).changeStatus({ id: request.params.id, versionId: request.params.versionId, actor: await actorOf(request), action: request.body.action })
    })

    app.post('/:id/versions/:versionId/canary', CanaryRequest, async (request): Promise<ConnectorBlueprintDetail> => {
        return connectorBlueprintPublishService(request.log).updateCanary({ id: request.params.id, versionId: request.params.versionId, actor: await actorOf(request), projectIds: request.body.projectIds })
    })
}

function actorOf(request: FastifyRequest): Promise<BlueprintActor> {
    return blueprintAccess.actor({ tenantId: request.principal.tenant.id, userId: request.principal.id })
}

const connectorDevelopers = securityAccess.publicTenant([PrincipalType.USER])
const IdParams = z.object({ id: EntityId })
const VersionParams = z.object({ id: EntityId, versionId: EntityId })

const ListRequest = { config: { security: connectorDevelopers }, schema: { querystring: ListConnectorBlueprintsQuery } }
const CreateRequest = { config: { security: connectorDevelopers }, schema: { body: CreateConnectorBlueprintRequest } }
const PreviewRequest = { config: { security: connectorDevelopers }, schema: { body: PreviewOpenApiBlueprintRequest } }
const ImportRequest = { config: { security: connectorDevelopers }, schema: { body: ImportOpenApiBlueprintRequest } }
const IdRequest = { config: { security: connectorDevelopers }, schema: { params: IdParams } }
const UpdateRequest = { config: { security: connectorDevelopers }, schema: { params: IdParams, body: UpdateConnectorBlueprintRequest } }
const CollaboratorsRequest = { config: { security: connectorDevelopers }, schema: { params: IdParams, body: UpdateBlueprintCollaboratorsRequest } }
const OwnerRequest = { config: { security: connectorDevelopers }, schema: { params: IdParams, body: TransferBlueprintOwnershipRequest } }
const TestDataRequest = { config: { security: connectorDevelopers }, schema: { params: IdParams, body: SaveBlueprintAuthTestDataRequest } }
const AuthTestRequest = { config: { security: connectorDevelopers }, schema: { params: IdParams, body: RunBlueprintAuthTestRequest } }
const DebugRequest = { config: { security: connectorDevelopers }, schema: { params: IdParams, body: DebugBlueprintOperationRequest } }
const DebugRecordRequest = { config: { security: connectorDevelopers }, schema: { params: IdParams, body: SaveBlueprintDebugRecordRequest } }
const PublishRequest = { config: { security: connectorDevelopers }, schema: { params: IdParams, body: PublishConnectorBlueprintRequest } }
const VersionStatusRequest = { config: { security: connectorDevelopers }, schema: { params: VersionParams, body: ChangeBlueprintVersionStatusRequest } }
const CanaryRequest = { config: { security: connectorDevelopers }, schema: { params: VersionParams, body: UpdateBlueprintCanaryRequest } }
