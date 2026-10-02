import { SeekPage } from '@fema-ipaas/core-utils'
import {
    AccessibleConnection,
    AddConnectionSharesRequestBody,
    ApplicationEventName,
    ConnectionDetail,
    ConnectionScopeImpact,
    ConnectionScopeImpactRequestBody,
    ConnectionShare,
    ConnectionShareUser,
    ListAccessibleConnectionsRequestQuery,
    ListConnectionShareCandidatesRequestQuery,
    PrincipalType,
    RemindConnectionOwnerResponse,
    UpdateConnectionAccessRequestBody,
    UpdateConnectionShareRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { connectionShareService } from './connection-share.service'

export const connectionShareController: FastifyPluginAsyncZod = async (app) => {
    app.get('/accessible', ListAccessibleRequest, async (request): Promise<SeekPage<AccessibleConnection>> => {
        return connectionShareService(request.log).listAccessible({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            query: request.query,
        })
    })

    app.get('/share-candidates', ShareCandidatesRequest, async (request): Promise<ConnectionShareUser[]> => {
        return connectionShareService(request.log).listShareCandidates({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            query: request.query,
        })
    })

    app.get('/:id/detail', DetailRequest, async (request): Promise<ConnectionDetail> => {
        return connectionShareService(request.log).detail({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            id: request.params.id,
        })
    })

    app.post('/:id/remind-reauth', RemindReauthRequest, async (request): Promise<RemindConnectionOwnerResponse> => {
        return connectionShareService(request.log).remindOwner({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            id: request.params.id,
        })
    })

    app.post('/:id/shares', AddSharesRequest, async (request): Promise<ConnectionShare[]> => {
        const result = await connectionShareService(request.log).addShares({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            id: request.params.id,
            request: request.body,
        })
        result.changed.forEach((changed) => {
            applicationEvents(request.log).sendUserEvent(request, {
                action: ApplicationEventName.CONNECTION_SHARE_UPDATED,
                data: {
                    connection: { id: result.connection.id, displayName: result.connection.displayName },
                    change: changed.change,
                    targetUser: { id: changed.userId, email: changed.email },
                    permission: request.body.permission,
                },
            })
        })
        return result.shares
    })

    app.post('/:id/shares/:userId', UpdateShareRequest, async (request): Promise<ConnectionShare[]> => {
        const result = await connectionShareService(request.log).updateShare({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            id: request.params.id,
            userId: request.params.userId,
            permission: request.body.permission,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTION_SHARE_UPDATED,
            data: {
                connection: { id: result.connection.id, displayName: result.connection.displayName },
                change: 'UPDATED',
                targetUser: { id: request.params.userId, email: result.email },
                permission: request.body.permission,
            },
        })
        return result.shares
    })

    app.delete('/:id/shares/:userId', RemoveShareRequest, async (request): Promise<ConnectionShare[]> => {
        const result = await connectionShareService(request.log).removeShare({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            id: request.params.id,
            userId: request.params.userId,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.CONNECTION_SHARE_UPDATED,
            data: {
                connection: { id: result.connection.id, displayName: result.connection.displayName },
                change: 'REMOVED',
                targetUser: { id: request.params.userId, email: result.email },
                permission: null,
            },
        })
        return result.shares
    })

    app.post('/:id/access-impact', AccessImpactRequest, async (request): Promise<ConnectionScopeImpact> => {
        return connectionShareService(request.log).scopeImpact({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            id: request.params.id,
            request: request.body,
        })
    })

    app.post('/:id/access', UpdateAccessRequest, async (request): Promise<ConnectionDetail> => {
        const result = await connectionShareService(request.log).updateAccess({
            tenantId: request.principal.tenant.id,
            principal: principalOf(request.principal),
            id: request.params.id,
            request: request.body,
        })
        if (result.projectMembersChanged) {
            applicationEvents(request.log).sendUserEvent(request, {
                action: ApplicationEventName.CONNECTION_SHARE_UPDATED,
                data: {
                    connection: { id: result.connection.id, displayName: result.connection.displayName },
                    change: 'PROJECT_MEMBERS',
                    targetUser: null,
                    permission: request.body.projectMembersPermission ?? null,
                },
            })
        }
        return connectionShareService(request.log).detail({
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            id: request.params.id,
        })
    })
}

function principalOf(principal: { id: string, type: PrincipalType, tenant: { id: string } }): { id: string, type: PrincipalType, tenantId: string } {
    return { id: principal.id, type: principal.type, tenantId: principal.tenant.id }
}

const IdParams = z.object({ id: z.string() })
const ShareParams = z.object({ id: z.string(), userId: z.string() })
const userOnly = securityAccess.publicTenant([PrincipalType.USER])

const ListAccessibleRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connections'],
        description: 'List the connections the current user owns or that are shared with them, across their projects.',
        querystring: ListAccessibleConnectionsRequestQuery,
        response: { [StatusCodes.OK]: SeekPage(AccessibleConnection) },
    },
}

const ShareCandidatesRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connections'],
        description: 'List the active members of the tenant a connection can be shared with.',
        querystring: ListConnectionShareCandidatesRequestQuery,
        response: { [StatusCodes.OK]: z.array(ConnectionShareUser) },
    },
}

const DetailRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connections'],
        description: 'Get a connection with its references and the members it is shared with.',
        params: IdParams,
        response: { [StatusCodes.OK]: ConnectionDetail },
    },
}

const RemindReauthRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connections'],
        description: 'Ask the owner of a broken connection to reconnect it. Limited to one reminder per member every six hours.',
        params: IdParams,
        response: { [StatusCodes.OK]: RemindConnectionOwnerResponse },
    },
}

const AddSharesRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connections'],
        description: 'Share a connection with members of the tenant.',
        params: IdParams,
        body: AddConnectionSharesRequestBody,
        response: { [StatusCodes.OK]: z.array(ConnectionShare) },
    },
}

const UpdateShareRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connections'],
        description: 'Change what a member may do with a shared connection.',
        params: ShareParams,
        body: UpdateConnectionShareRequestBody,
        response: { [StatusCodes.OK]: z.array(ConnectionShare) },
    },
}

const RemoveShareRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connections'],
        description: 'Stop sharing a connection with a member.',
        params: ShareParams,
        response: { [StatusCodes.OK]: z.array(ConnectionShare) },
    },
}

const AccessImpactRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connections'],
        description: 'List the workflows that would lose access if the connection became available to fewer projects.',
        params: IdParams,
        body: ConnectionScopeImpactRequestBody,
        response: { [StatusCodes.OK]: ConnectionScopeImpact },
    },
}

const UpdateAccessRequest = {
    config: { security: userOnly },
    schema: {
        tags: ['connections'],
        description: 'Change the projects a connection is available in and what project members may do with it.',
        params: IdParams,
        body: UpdateConnectionAccessRequestBody,
        response: { [StatusCodes.OK]: ConnectionDetail },
    },
}
