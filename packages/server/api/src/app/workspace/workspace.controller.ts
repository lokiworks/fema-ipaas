import { assertNotNullOrUndefined, ErrorCode, isNil, PlatformError, SeekPage } from '@fema/core-utils'
import { CreatePlatformWorkspaceRequest, ListWorkspaceRequestForPlatformQueryParams, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI, UpdateWorkspacePlatformRequest, WorkspaceType, WorkspaceWithLimits } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { userService } from '../user/user-service'
import { workspaceRepo, workspaceService } from './workspace-service'
import { workspaceSideEffects } from './workspace-side-effects'

export const workspaceController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListWorkspacesRequest, async (request) => {
        const platformId = request.principal.platform.id
        const user = await userService(request.log).getOneOrFail({ id: request.principal.id })
        const workspaces = await workspaceService(request.log).getAllForUser({
            platformId,
            userId: request.principal.id,
            isPrivileged: userService(request.log).isUserPrivileged(user),
            ...(isNil(request.query.displayName) ? {} : { displayName: request.query.displayName }),
        })
        const filtered = isNil(request.query.externalId)
            ? workspaces
            : workspaces.filter((workspace) => workspace.externalId === request.query.externalId)
        const enriched = await Promise.all(filtered.map((workspace) => workspaceSideEffects(request.log).enrich(workspace)))
        return {
            data: enriched,
            next: null,
            previous: null,
        }
    })

    app.post('/', CreateWorkspaceRequest, async (request, reply) => {
        const platformId = request.principal.platform.id
        const workspace = await workspaceService(request.log).create({
            ownerId: request.principal.id,
            displayName: request.body.displayName,
            type: WorkspaceType.TEAM,
            platformId,
            ...(isNil(request.body.externalId) ? {} : { externalId: request.body.externalId }),
            ...(isNil(request.body.metadata) ? {} : { metadata: request.body.metadata }),
            ...(isNil(request.body.maxConcurrentJobs) ? {} : { maxConcurrentJobs: request.body.maxConcurrentJobs }),
        })
        return reply.status(StatusCodes.CREATED).send(await workspaceSideEffects(request.log).enrich(workspace))
    })

    app.post('/:id', UpdateWorkspaceRequest, async (request) => {
        const workspace = await assertWorkspaceBelongsToPlatform({
            workspaceId: request.params.id,
            platformId: request.principal.platform.id,
            log: request.log,
        })
        const updated = await workspaceService(request.log).update(workspace.id, {
            type: workspace.type,
            ...request.body,
        })
        return workspaceSideEffects(request.log).enrich(updated)
    })

    app.delete('/:id', DeleteWorkspaceRequest, async (request, reply) => {
        const workspace = await assertWorkspaceBelongsToPlatform({
            workspaceId: request.params.id,
            platformId: request.principal.platform.id,
            log: request.log,
        })
        await workspaceSideEffects(request.log).assertDeletable(workspace.id)
        await workspaceRepo().softDelete({ id: workspace.id })
        await workspaceSideEffects(request.log).scheduleHardDelete(workspace.id)
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

async function assertWorkspaceBelongsToPlatform({ workspaceId, platformId, log }: AssertParams) {
    const workspace = await workspaceService(log).getOneOrThrow(workspaceId)
    assertNotNullOrUndefined(workspace.platformId, 'platformId')
    if (workspace.platformId !== platformId) {
        throw new PlatformError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityId: workspaceId, entityType: 'workspace' },
        })
    }
    return workspace
}

const ListWorkspacesRequest = {
    config: {
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['workspaces'],
        description: 'List the workspaces the caller can access inside the current platform.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListWorkspaceRequestForPlatformQueryParams,
        response: {
            [StatusCodes.OK]: SeekPage(WorkspaceWithLimits),
        },
    },
}

const CreateWorkspaceRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['workspaces'],
        description: 'Create a workspace inside the current platform.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        body: CreatePlatformWorkspaceRequest,
        response: {
            [StatusCodes.CREATED]: WorkspaceWithLimits,
        },
    },
}

const UpdateWorkspaceRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['workspaces'],
        description: 'Update a workspace inside the current platform.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({ id: z.string() }),
        body: UpdateWorkspacePlatformRequest,
        response: {
            [StatusCodes.OK]: WorkspaceWithLimits,
        },
    },
}

const DeleteWorkspaceRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['workspaces'],
        description: 'Soft-delete a workspace and schedule its permanent removal.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({ id: z.string() }),
        response: {
            [StatusCodes.NO_CONTENT]: z.never(),
        },
    },
}

type AssertParams = {
    workspaceId: string
    platformId: string
    log: Parameters<typeof workspaceService>[0]
}
