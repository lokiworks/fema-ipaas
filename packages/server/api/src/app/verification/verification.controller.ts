import { Permission } from '@fema-ipaas/core-utils'
import { PrincipalType, RunVerificationRequestBody, VerificationRun } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { verificationRunService } from './verification-run.service'

export const verificationController: FastifyPluginAsyncZod = async (app) => {
    app.post('/run', RunRequest, async (request): Promise<{ runId: string }> => {
        return verificationRunService(request.log).start({
            projectId: request.projectId,
            tenantId: request.principal.tenant.id,
            sinceHours: request.body.sinceHours,
        })
    })
    app.get('/runs/:runId', GetRunRequest, async (request): Promise<VerificationRun> => {
        return verificationRunService(request.log).get({ runId: request.params.runId, projectId: request.projectId })
    })
}

const RunRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_ISSUE, { type: ProjectResourceType.BODY }) },
    schema: {
        tags: ['verification'],
        description: 'Read back what recent successful runs wrote and report where the connected system differs',
        body: RunVerificationRequestBody,
        response: { 200: z.object({ runId: z.string() }) },
    },
}

const GetRunRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.READ_ISSUE, { type: ProjectResourceType.QUERY }) },
    schema: {
        tags: ['verification'],
        params: z.object({ runId: z.string() }),
        querystring: z.object({ projectId: z.string() }),
        response: { 200: VerificationRun },
    },
}
