import { ActivepiecesError, assertNotNullOrUndefined, ErrorCode, isNil, SeekPage } from '@activepieces/core-utils'
import { CreatePlatformProjectRequest, PrincipalType, ListProjectRequestForPlatformQueryParams, ProjectType, ProjectWithLimits, SERVICE_KEY_SECURITY_OPENAPI, UpdateProjectPlatformRequest } from '@activepieces/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { userService } from '../user/user-service'
import { projectRepo, projectService } from './project-service'
import { projectSideEffects } from './project-side-effects'

export const projectController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListProjectsRequest, async (request) => {
        const platformId = request.principal.platform.id
        const user = await userService(request.log).getOneOrFail({ id: request.principal.id })
        const projects = await projectService(request.log).getAllForUser({
            platformId,
            userId: request.principal.id,
            isPrivileged: userService(request.log).isUserPrivileged(user),
            ...(isNil(request.query.displayName) ? {} : { displayName: request.query.displayName }),
        })
        const filtered = isNil(request.query.externalId)
            ? projects
            : projects.filter((project) => project.externalId === request.query.externalId)
        const enriched = await Promise.all(filtered.map((project) => projectSideEffects(request.log).enrich(project)))
        return {
            data: enriched,
            next: null,
            previous: null,
        }
    })

    app.post('/', CreateProjectRequest, async (request, reply) => {
        const platformId = request.principal.platform.id
        const project = await projectService(request.log).create({
            ownerId: request.principal.id,
            displayName: request.body.displayName,
            type: ProjectType.TEAM,
            platformId,
            ...(isNil(request.body.externalId) ? {} : { externalId: request.body.externalId }),
            ...(isNil(request.body.metadata) ? {} : { metadata: request.body.metadata }),
            ...(isNil(request.body.maxConcurrentJobs) ? {} : { maxConcurrentJobs: request.body.maxConcurrentJobs }),
        })
        return reply.status(StatusCodes.CREATED).send(await projectSideEffects(request.log).enrich(project))
    })

    app.post('/:id', UpdateProjectRequest, async (request) => {
        const project = await assertProjectBelongsToPlatform({
            projectId: request.params.id,
            platformId: request.principal.platform.id,
            log: request.log,
        })
        const updated = await projectService(request.log).update(project.id, {
            type: project.type,
            ...request.body,
        })
        return projectSideEffects(request.log).enrich(updated)
    })

    app.delete('/:id', DeleteProjectRequest, async (request, reply) => {
        const project = await assertProjectBelongsToPlatform({
            projectId: request.params.id,
            platformId: request.principal.platform.id,
            log: request.log,
        })
        await projectSideEffects(request.log).assertDeletable(project.id)
        await projectRepo().softDelete({ id: project.id })
        await projectSideEffects(request.log).scheduleHardDelete(project.id)
        return reply.status(StatusCodes.NO_CONTENT).send()
    })
}

async function assertProjectBelongsToPlatform({ projectId, platformId, log }: AssertParams) {
    const project = await projectService(log).getOneOrThrow(projectId)
    assertNotNullOrUndefined(project.platformId, 'platformId')
    if (project.platformId !== platformId) {
        throw new ActivepiecesError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityId: projectId, entityType: 'project' },
        })
    }
    return project
}

const ListProjectsRequest = {
    config: {
        security: securityAccess.publicPlatform([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['projects'],
        description: 'List the projects the caller can access inside the current platform.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        querystring: ListProjectRequestForPlatformQueryParams,
        response: {
            [StatusCodes.OK]: SeekPage(ProjectWithLimits),
        },
    },
}

const CreateProjectRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['projects'],
        description: 'Create a project inside the current platform.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        body: CreatePlatformProjectRequest,
        response: {
            [StatusCodes.CREATED]: ProjectWithLimits,
        },
    },
}

const UpdateProjectRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['projects'],
        description: 'Update a project inside the current platform.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({ id: z.string() }),
        body: UpdateProjectPlatformRequest,
        response: {
            [StatusCodes.OK]: ProjectWithLimits,
        },
    },
}

const DeleteProjectRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
    schema: {
        tags: ['projects'],
        description: 'Soft-delete a project and schedule its permanent removal.',
        security: [SERVICE_KEY_SECURITY_OPENAPI],
        params: z.object({ id: z.string() }),
        response: {
            [StatusCodes.NO_CONTENT]: z.never(),
        },
    },
}

type AssertParams = {
    projectId: string
    platformId: string
    log: Parameters<typeof projectService>[0]
}
