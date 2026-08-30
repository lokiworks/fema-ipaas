import { SeekPage } from '@fema-ipaas/core-utils'
import { ApplicationEventName, ConnectionScope, ConnectionWithoutSensitiveData, ListGlobalConnectionsRequestQuery, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, UpdateGlobalConnectionValueRequestBody, UpsertGlobalConnectionRequestBody } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { securityHelper } from '../helper/security-helper'
import { connectionService } from './connection-service/connection-service'

export const globalConnectionController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListGlobalConnectionsRequest, async (request): Promise<SeekPage<ConnectionWithoutSensitiveData>> => {
        const { displayName, connectorName, status, cursor, limit } = request.query
        const connections = await connectionService(request.log).list({
            tenantId: request.principal.tenant.id,
            projectId: null,
            scope: ConnectionScope.TENANT,
            connectorName,
            displayName,
            status,
            externalIds: undefined,
            cursorRequest: cursor ?? null,
            limit: limit ?? DEFAULT_PAGE_SIZE,
        })
        return {
            ...connections,
            data: connections.data.map(connectionService(request.log).removeSensitiveData),
        }
    })

    app.post('/', UpsertGlobalConnectionRequest, async (request, reply) => {
        const ownerId = await securityHelper.getUserIdFromRequest(request)
        const baseUpsert = {
            tenantId: request.principal.tenant.id,
            projectIds: request.body.projectIds,
            externalId: request.body.externalId ?? request.body.displayName,
            displayName: request.body.displayName,
            connectorName: request.body.connectorName,
            ownerId,
            scope: ConnectionScope.TENANT,
            metadata: request.body.metadata,
            connectorVersion: request.body.connectorVersion,
            preSelectForNewProjects: request.body.preSelectForNewProjects,
        }
        const connection = await connectionService(request.log).upsert({
            ...baseUpsert,
            type: request.body.type,
            value: request.body.value,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTION_UPSERTED,
            data: { connection },
        })
        await reply.status(StatusCodes.CREATED).send(connection)
    })

    app.post('/:id', UpdateGlobalConnectionRequest, async (request): Promise<ConnectionWithoutSensitiveData> => {
        return connectionService(request.log).update({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
            projectIds: null,
            scope: ConnectionScope.TENANT,
            request: {
                displayName: request.body.displayName,
                projectIds: request.body.projectIds ?? null,
                metadata: request.body.metadata,
                preSelectForNewProjects: request.body.preSelectForNewProjects,
            },
        })
    })

    app.delete('/:id', DeleteGlobalConnectionRequest, async (request, reply) => {
        await connectionService(request.log).delete({
            id: request.params.id,
            tenantId: request.principal.tenant.id,
            projectId: null,
            scope: ConnectionScope.TENANT,
        })
        await reply.status(StatusCodes.NO_CONTENT).send()
    })
}

const DEFAULT_PAGE_SIZE = 10

const tenantAdminOnly = securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE])

const ListGlobalConnectionsRequest = {
    config: { security: tenantAdminOnly },
    schema: {
        tags: ['global-connections'],
        description: 'List the connections shared across every project in the tenant.',
        querystring: ListGlobalConnectionsRequestQuery,
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}

const UpsertGlobalConnectionRequest = {
    config: { security: tenantAdminOnly },
    schema: {
        tags: ['global-connections'],
        description: 'Create a global connection, or replace the one with the same external id.',
        body: UpsertGlobalConnectionRequestBody,
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}

const UpdateGlobalConnectionRequest = {
    config: { security: tenantAdminOnly },
    schema: {
        tags: ['global-connections'],
        description: 'Update a global connection value.',
        params: z.object({ id: z.string() }),
        body: UpdateGlobalConnectionValueRequestBody,
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}

const DeleteGlobalConnectionRequest = {
    config: { security: tenantAdminOnly },
    schema: {
        tags: ['global-connections'],
        description: 'Delete a global connection.',
        params: z.object({ id: z.string() }),
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}
