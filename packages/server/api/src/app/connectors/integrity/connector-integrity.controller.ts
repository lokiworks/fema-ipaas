import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { connectorIntegrity } from './connector-integrity'
import { connectorIntegrityService, IntegrityReport } from './connector-integrity.service'

export const connectorIntegrityController: FastifyPluginAsyncZod = async (app) => {
    app.post('/verify', VerifyRequest, async (request): Promise<IntegrityReport & { signatureRequired: boolean }> => {
        const report = await connectorIntegrityService(request.log).verifyAll(request.principal.tenant.id)
        return { ...report, signatureRequired: connectorIntegrity.signatureRequired() }
    })
}

const VerifyRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER, PrincipalType.SERVICE]),
    },
}
