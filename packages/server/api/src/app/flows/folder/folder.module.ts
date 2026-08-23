import { Permission } from '@fema/core-utils'
import { ApplicationEventName, CreateFolderRequest, DeleteFolderRequest, ListFolderRequest, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, UpdateFolderRequest } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { entitiesMustBeOwnedByCurrentWorkspace } from '../../authentication/authorization'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { applicationEvents } from '../../helper/application-events'
import { FolderEntity } from './folder.entity'
import { flowFolderService as folderService } from './folder.service'

const DEFAULT_PAGE_SIZE = 10
export const folderModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(folderController, { prefix: '/v1/folders' })
}

const folderController: FastifyPluginAsyncZod = async (fastify) => {
    fastify.addHook('preSerialization', entitiesMustBeOwnedByCurrentWorkspace)

    fastify.post('/', CreateFolderParams, async (request) => {
        const createdFolder = await folderService(request.log).upsert({
            workspaceId: request.workspaceId,
            request: request.body,
        })
        applicationEvents(request.log).sendUserEvent(request, {
            action: ApplicationEventName.FOLDER_CREATED,
            data: {
                folder: createdFolder,
            },
        })
        return createdFolder
    },
    )

    fastify.post(
        '/:id',
        UpdateFolderParams,
        async (request) => {
            const updatedFlow = await folderService(request.log).update({
                workspaceId: request.workspaceId,
                folderId: request.params.id,
                request: request.body,
            })

            applicationEvents(request.log).sendUserEvent(request, {
                action: ApplicationEventName.FOLDER_UPDATED,
                data: {
                    folder: updatedFlow,
                },
            })

            return updatedFlow
        },
    )

    fastify.get(
        '/:id',
        GetFolderParams,
        async (
            request,
        ) => {
            return folderService(request.log).getOneOrThrow({
                workspaceId: request.workspaceId,
                folderId: request.params.id,
            })
        },
    )

    fastify.get(
        '/',
        ListFoldersParams,
        async (request) => {
            return folderService(request.log).list({
                workspaceId: request.workspaceId,
                cursorRequest: request.query.cursor ?? null,
                limit: request.query.limit ?? DEFAULT_PAGE_SIZE,
            })
        },
    )

    fastify.delete(
        '/:id',
        DeleteFolderParams,
        async (request, reply) => {
            const folder = await folderService(request.log).getOneOrThrow({
                workspaceId: request.workspaceId,
                folderId: request.params.id,
            })
            applicationEvents(request.log).sendUserEvent(request, {
                action: ApplicationEventName.FOLDER_DELETED,
                data: {
                    folder,
                },
            })
            await folderService(request.log).delete({
                workspaceId: request.workspaceId,
                folderId: request.params.id,
            })
            return reply.status(StatusCodes.OK).send()
        },
    )
}


const CreateFolderParams = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_FLOW, {
                type: WorkspaceResourceType.BODY,
            }),
    },
    schema: {
        tags: ['folders'],
        description: 'Create a new folder',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        body: CreateFolderRequest,
    },
}

const UpdateFolderParams = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_FLOW, {
                type: WorkspaceResourceType.TABLE,
                tableName: FolderEntity,
            }),
    },
    schema: {
        tags: ['folders'],
        description: 'Update an existing folder',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({
            id: z.string(),
        }),
        body: UpdateFolderRequest,
    },
}

const GetFolderParams = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_FLOW, {
                type: WorkspaceResourceType.TABLE,
                tableName: FolderEntity,
            }),
    },
    schema: {
        tags: ['folders'],
        params: z.object({
            id: z.string(),
        }),
        description: 'Get a folder by id',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}

const ListFoldersParams = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.READ_FLOW, {
                type: WorkspaceResourceType.QUERY,
            }),
    },
    schema: {
        tags: ['folders'],
        description: 'List folders',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListFolderRequest,
    },
}

const DeleteFolderParams = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            Permission.WRITE_FLOW, {
                type: WorkspaceResourceType.TABLE,
                tableName: FolderEntity,
            }),
    },
    schema: {
        params: DeleteFolderRequest,
        tags: ['folders'],
        description: 'Delete a folder',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}