import { ApplicationError, assertNotNullOrUndefined, ErrorCode, isNil } from '@fema/core-utils'
import { Connection, EnginePrincipal, GetConnectionForWorkerRequestQuery } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { connectionService } from './connection-service/connection-service'

export const connectionWorkerController: FastifyPluginAsyncZod = async (app) => {

    app.get('/:externalId', GetConnectionRequest, async (request): Promise<Connection> => {
        const enginePrincipal = (request.principal as EnginePrincipal)
        assertNotNullOrUndefined(enginePrincipal.workspaceId, 'workspaceId')
        const connection = await connectionService(request.log).getOne({
            workspaceId: enginePrincipal.workspaceId,
            tenantId: enginePrincipal.tenant.id,
            externalId: request.params.externalId,
        })

        if (isNil(connection)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityId: `externalId=${request.params.externalId}`,
                    entityType: 'Connection',
                },
            })
        }

        return {
            ...connection,
            value: connection.value,
        }
    },
    )

}

const GetConnectionRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        params: GetConnectionForWorkerRequestQuery,
    },
}
