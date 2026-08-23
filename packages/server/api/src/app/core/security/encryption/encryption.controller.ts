import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { encryptionRotationService, RotationReport } from '../../../helper/encryption-rotation.service'
import { securityAccess } from '../authorization/fastify-security'

export const encryptionController: FastifyPluginAsyncZod = async (app) => {
    app.post('/rotate', RotateKeyRequest, async (request): Promise<RotationReport> => {
        return encryptionRotationService(request.log).rotate()
    })
}

const RotateKeyRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
}
