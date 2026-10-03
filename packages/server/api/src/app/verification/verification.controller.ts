import { Permission } from '@fema-ipaas/core-utils'
import { PrincipalType, RunVerificationRequestBody, RunVerificationResult } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { verificationService } from './verification.service'

export const verificationController: FastifyPluginAsyncZod = async (app) => {
    app.post('/run', RunRequest, async (request): Promise<RunVerificationResult> => {
        return verificationService(request.log).run({
            projectId: request.projectId,
            tenantId: request.principal.tenant.id,
            sinceHours: request.body.sinceHours,
        })
    })
}

const RunRequest = {
    config: { security: securityAccess.project([PrincipalType.USER], Permission.WRITE_ISSUE, { type: ProjectResourceType.BODY }) },
    schema: {
        tags: ['verification'],
        description: 'Read back what recent successful runs wrote and report where the connected system differs',
        body: RunVerificationRequestBody,
        response: { 200: RunVerificationResult },
    },
}
