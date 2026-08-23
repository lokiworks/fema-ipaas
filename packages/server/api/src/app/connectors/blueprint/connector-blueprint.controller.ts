import { ApId, SeekPage } from '@fema-ipaas/core-utils'
import { ConnectorBlueprint, GenerateFromBlueprintResponse, PrincipalType, UpsertConnectorBlueprintRequest } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { connectorBlueprintGenerator } from './connector-blueprint-generator'
import { connectorBlueprintService } from './connector-blueprint.service'

export const connectorBlueprintController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<SeekPage<ConnectorBlueprint>> => {
        return connectorBlueprintService(request.log).list(request.principal.tenant.id)
    })

    app.post('/', UpsertRequest, async (request): Promise<ConnectorBlueprint> => {
        return connectorBlueprintService(request.log).upsert({
            id: request.body.id,
            tenantId: request.principal.tenant.id,
            definition: request.body.definition,
        })
    })

    app.get('/:id', GetRequest, async (request): Promise<ConnectorBlueprint> => {
        return connectorBlueprintService(request.log).getOneOrThrow({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
        })
    })

    app.post('/:id/generate', GetRequest, async (request): Promise<GenerateFromBlueprintResponse> => {
        const blueprint = await connectorBlueprintService(request.log).getOneOrThrow({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
        })
        return {
            connectorName: blueprint.definition.connectorName,
            displayName: blueprint.definition.displayName,
            files: connectorBlueprintGenerator.generate(blueprint.definition),
        }
    })

    app.delete('/:id', GetRequest, async (request, reply) => {
        await connectorBlueprintService(request.log).delete({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const adminOnly = securityAccess.tenantAdminOnly([PrincipalType.USER])

const ListRequest = { config: { security: adminOnly } }

const UpsertRequest = {
    config: { security: adminOnly },
    schema: { body: UpsertConnectorBlueprintRequest },
}

const GetRequest = {
    config: { security: adminOnly },
    schema: { params: z.object({ id: ApId }) },
}
