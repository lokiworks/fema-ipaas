import { SeekPage } from '@fema/core-utils'
import { ListPlatformConnectionsRequestQuery, PlatformConnectionOwnersResponse, PlatformConnectionsListItem, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { connectionService } from './connection-service/connection-service'

export const platformConnectionController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListPlatformConnectionsRequest, async (request): Promise<SeekPage<PlatformConnectionsListItem>> => {
        const { displayName, connectorName, status, scope, cursor, limit, projectIds, ownerIds } = request.query
        return connectionService(request.log).listForPlatform({
            platformId: request.principal.platform.id,
            connectorName,
            displayName,
            status,
            scope,
            projectIds,
            ownerIds,
            cursorRequest: cursor ?? null,
            limit: limit ?? DEFAULT_PAGE_SIZE,
        })
    })

    app.get('/owners', ListPlatformConnectionOwnersRequest, async (request): Promise<PlatformConnectionOwnersResponse> => {
        return connectionService(request.log).listOwnersForPlatform({
            platformId: request.principal.platform.id,
        })
    })
}

const DEFAULT_PAGE_SIZE = 10

const ListPlatformConnectionsRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        querystring: ListPlatformConnectionsRequestQuery,
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        response: {
            [StatusCodes.OK]: SeekPage(PlatformConnectionsListItem),
        },
    },
}

const ListPlatformConnectionOwnersRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        response: {
            [StatusCodes.OK]: PlatformConnectionOwnersResponse,
        },
    },
}
