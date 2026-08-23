import { CreateOtpRequestBody } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { authnRateLimit } from '../../core/security/rate-limit'
import { tenantUtils } from '../../tenant/tenant.utils'
import { otpService } from './otp-service'

export const otpController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreateOtpRequest, async (req, res) => {
        const tenantId = await tenantUtils.getTenantIdForRequest(req)
        await otpService(req.log).createAndSend({
            tenantId,
            email: req.body.email,
            type: req.body.type,
        })
        return res.code(StatusCodes.NO_CONTENT).send()
    })
}

const CreateOtpRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: CreateOtpRequestBody,
    },
}
