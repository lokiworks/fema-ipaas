import { Permission } from '@fema-ipaas/core-utils'
import {
    CreateSolutionFromProjectRequestBody,
    InstallSolutionRequestBody,
    ListSolutionInstallsRequestQuery,
    ListSolutionsRequestQuery,
    PrincipalType,
    PublishSolutionVersionRequestBody,
    RunSolutionChecksRequestBody,
    SolutionCheckResults,
    SolutionDetail,
    SolutionInstall,
    SolutionInstallInput,
    SolutionInstallPreview,
    SolutionInstallResult,
    SolutionSummary,
} from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { solutionService } from './solution.service'

export const solutionController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<SolutionSummary[]> => {
        return solutionService(request.log).list({ tenantId: request.principal.tenant.id, userId: request.principal.id, query: request.query })
    })

    app.get('/installs', ListInstallsRequest, async (request): Promise<SolutionInstall[]> => {
        return solutionService(request.log).listInstalls({ tenantId: request.principal.tenant.id, userId: request.principal.id, query: request.query })
    })

    app.post('/installs/:installId/upgrade', UpgradeRequest, async (request): Promise<SolutionInstall> => {
        return solutionService(request.log).upgrade({ installId: request.params.installId, tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.post('/', CreateFromProjectRequest, async (request, reply) => {
        const solution = await solutionService(request.log).createFromProject({ tenantId: request.principal.tenant.id, userId: request.principal.id, request: request.body })
        await reply.status(StatusCodes.CREATED).send(solution)
    })

    app.get('/:id', GetRequest, async (request): Promise<SolutionDetail> => {
        return solutionService(request.log).getDetail({ id: request.params.id, tenantId: request.principal.tenant.id, userId: request.principal.id })
    })

    app.post('/:id/versions', PublishVersionRequest, async (request): Promise<SolutionDetail> => {
        return solutionService(request.log).publishVersion({ id: request.params.id, tenantId: request.principal.tenant.id, userId: request.principal.id, request: request.body })
    })

    app.post('/:id/preview', PreviewRequest, async (request): Promise<SolutionInstallPreview> => {
        return solutionService(request.log).installPreview({ id: request.params.id, tenantId: request.principal.tenant.id, userId: request.principal.id, input: request.body })
    })

    app.post('/:id/checks', ChecksRequest, async (request): Promise<SolutionCheckResults> => {
        return solutionService(request.log).runChecks({ id: request.params.id, tenantId: request.principal.tenant.id, userId: request.principal.id, request: request.body })
    })

    app.post('/:id/install', InstallRequest, async (request, reply) => {
        const result: SolutionInstallResult = await solutionService(request.log).install({ id: request.params.id, tenantId: request.principal.tenant.id, userId: request.principal.id, request: request.body })
        await reply.status(StatusCodes.CREATED).send(result)
    })
}

const IdParams = z.object({ id: z.string() })
const InstallIdParams = z.object({ installId: z.string() })

const ListRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['solutions'], querystring: ListSolutionsRequestQuery },
}

const ListInstallsRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['solutions'], querystring: ListSolutionInstallsRequestQuery },
}

const GetRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['solutions'], params: IdParams },
}

const UpgradeRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['solutions'], params: InstallIdParams },
}

const CreateFromProjectRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['solutions'], body: CreateSolutionFromProjectRequestBody },
}

const PublishVersionRequest = {
    config: { security: securityAccess.publicTenant([PrincipalType.USER]) },
    schema: { tags: ['solutions'], params: IdParams, body: PublishSolutionVersionRequestBody },
}

const PreviewRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['solutions'], params: IdParams, body: SolutionInstallInput },
}

const ChecksRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['solutions'], params: IdParams, body: RunSolutionChecksRequestBody },
}

const InstallRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_WORKFLOW, { type: ProjectResourceType.BODY }) },
    schema: { tags: ['solutions'], params: IdParams, body: InstallSolutionRequestBody },
}
