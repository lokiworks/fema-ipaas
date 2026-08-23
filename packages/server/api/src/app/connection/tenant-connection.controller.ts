import { SeekPage } from '@fema/core-utils'
import { ListTenantConnectionsRequestQuery, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, TenantConnectionOwnersResponse, TenantConnectionsListItem } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { connectionService } from './connection-service/connection-service'

export const tenantConnectionController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListTenantConnectionsRequest, async (request): Promise<SeekPage<TenantConnectionsListItem>> => {
        const { displayName, connectorName, status, scope, cursor, limit, workspaceIds, ownerIds } = request.query
        return connectionService(request.log).listForTenant({
            tenantId: request.principal.tenant.id,
            connectorName,
            displayName,
            status,
            scope,
            workspaceIds,
            ownerIds,
            cursorRequest: cursor ?? null,
            limit: limit ?? DEFAULT_PAGE_SIZE,
        })
    })

    app.get('/owners', ListTenantConnectionOwnersRequest, async (request): Promise<TenantConnectionOwnersResponse> => {
        return connectionService(request.log).listOwnersForTenant({
            tenantId: request.principal.tenant.id,
        })
    })
}

const DEFAULT_PAGE_SIZE = 10

const ListTenantConnectionsRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        querystring: ListTenantConnectionsRequestQuery,
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        response: {
            [StatusCodes.OK]: SeekPage(TenantConnectionsListItem),
        },
    },
}

const ListTenantConnectionOwnersRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        response: {
            [StatusCodes.OK]: TenantConnectionOwnersResponse,
        },
    },
}
