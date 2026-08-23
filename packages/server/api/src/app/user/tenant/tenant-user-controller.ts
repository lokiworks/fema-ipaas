import { ApId, assertNotNullOrUndefined, SeekPage } from '@fema/core-utils'
import { ListUsersRequestBody, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, UpdateUserRequestBody, UserWithMetaInformation } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { userService } from '../user-service'

export const tenantUserController: FastifyPluginAsyncZod = async (app) => {

    app.get('/', ListUsersRequest, async (req) => {
        const tenantId = req.principal.tenant.id
        assertNotNullOrUndefined(tenantId, 'tenantId')

        return userService(req.log).list({
            tenantId,
            externalId: req.query.externalId,
            cursorRequest: req.query.cursor ?? null,
            limit: req.query.limit ?? 10,
        })
    })

    app.post('/:id', UpdateUserRequest, async (req) => {
        const tenantId = req.principal.tenant.id
        assertNotNullOrUndefined(tenantId, 'tenantId')

        return userService(req.log).update({
            id: req.params.id,
            tenantId,
            tenantRole: req.body.tenantRole,
            status: req.body.status,
            externalId: req.body.externalId,
        })
    })

    app.delete('/:id', DeleteUserRequest, async (req, res) => {
        const tenantId = req.principal.tenant.id
        assertNotNullOrUndefined(tenantId, 'tenantId')


        await userService(req.log).delete({
            id: req.params.id,
            tenantId,
        })

        return res.status(StatusCodes.NO_CONTENT).send()
    })
}

const ListUsersRequest = {
    schema: {
        querystring: ListUsersRequestBody,
        response: {
            [StatusCodes.OK]: SeekPage(UserWithMetaInformation),
        },
        tags: ['users'],
        description: 'List users',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
    response: {
        [StatusCodes.OK]: SeekPage(UserWithMetaInformation),
    },
    config: {
        security: securityAccess.nonEmbedUsersOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
}

const UpdateUserRequest = {
    schema: {
        params: z.object({
            id: ApId,
        }),
        body: UpdateUserRequestBody,
        response: {
            [StatusCodes.OK]: UserWithMetaInformation,
        },
        tags: ['users'],
        description: 'Update user',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
}

const DeleteUserRequest = {
    schema: {
        params: z.object({
            id: ApId,
        }),
        tags: ['users'],
        description: 'Delete user',
        response: {
            [StatusCodes.NO_CONTENT]: z.never(),
        },
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
}
