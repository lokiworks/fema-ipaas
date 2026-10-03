import { EncryptionKeyStatus, PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { encryptionRotationService, RotationReport } from '../../../helper/encryption-rotation.service'
import { tenantUtils } from '../../../tenant/tenant.utils'
import { securityAccess } from '../authorization/fastify-security'
import { encryptionStatusService } from './encryption-status.service'

export const encryptionController: FastifyPluginAsyncZod = async (app) => {
    app.get('/status', StatusRequest, async (request): Promise<EncryptionKeyStatus> => {
        return encryptionStatusService(request.log).get()
    })

    app.post('/rotate', RotateKeyRequest, async (request): Promise<RotationReport> => {
        await tenantUtils.assertPrimaryTenant({ request })
        const report = await encryptionRotationService(request.log).rotate()
        await encryptionStatusService(request.log).recordReencryption()
        return report
    })
}

const StatusRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
    schema: {
        response: {
            [StatusCodes.OK]: EncryptionKeyStatus,
        },
    },
}

const RotateKeyRequest = {
    config: {
        security: securityAccess.tenantAdminOnly([PrincipalType.USER]),
    },
}
