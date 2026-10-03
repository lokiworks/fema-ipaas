import { Permission } from '@fema-ipaas/core-utils'
import {
    CopyProjectRequestBody,
    CopyProjectResponse,
    PrincipalType,
    ProjectDirectoryItem,
    ProjectResourceCounts,
    ProjectType,
    ProjectWithLimits,
    SaveProjectInfoRequestBody,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { projectCopyService } from './project-copy.service'
import { projectDirectoryService } from './project-directory.service'
import { projectService } from './project-service'
import { projectSideEffects } from './project-side-effects'

export const projectDirectoryController: FastifyPluginAsyncZod = async (app) => {
    app.get('/directory', DirectoryRequest, async (request): Promise<ProjectDirectoryItem[]> => {
        return projectDirectoryService(request.log).list({ tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.post('/:id/info', SaveInfoRequest, async (request): Promise<ProjectWithLimits> => {
        const project = await projectService(request.log).getOneOrThrow(request.projectId)
        if (project.type !== ProjectType.TEAM) {
            return projectSideEffects(request.log).enrich(project)
        }
        await projectService(request.log).assertDisplayNameAvailable({
            tenantId: request.principal.tenant.id,
            displayName: request.body.displayName,
            excludeProjectId: project.id,
        })
        const updated = await projectService(request.log).update(project.id, {
            type: ProjectType.TEAM,
            displayName: request.body.displayName,
            description: request.body.description ?? null,
            icon: request.body.icon,
        })
        return projectSideEffects(request.log).enrich(updated)
    })

    app.get('/:id/resource-counts', ResourceCountsRequest, async (request): Promise<ProjectResourceCounts> => {
        return projectDirectoryService(request.log).resourceCounts({ projectId: request.projectId })
    })

    app.post('/:id/copy', CopyRequest, async (request, reply) => {
        const result: CopyProjectResponse = await projectCopyService(request.log).copy({
            sourceProjectId: request.projectId,
            tenantId: request.principal.tenant.id,
            userId: request.principal.id,
            displayName: request.body.displayName,
        })
        await reply.status(StatusCodes.CREATED).send(result)
    })
}

const IdParams = z.object({ id: z.string() })

const DirectoryRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['projects'] },
}

const SaveInfoRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_PROJECT, { type: ProjectResourceType.PARAM, paramKey: 'id' }) },
    schema: { tags: ['projects'], params: IdParams, body: SaveProjectInfoRequestBody },
}

const ResourceCountsRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_PROJECT, { type: ProjectResourceType.PARAM, paramKey: 'id' }) },
    schema: { tags: ['projects'], params: IdParams },
}

const CopyRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.PARAM, paramKey: 'id' }) },
    schema: { tags: ['projects'], params: IdParams, body: CopyProjectRequestBody },
}
