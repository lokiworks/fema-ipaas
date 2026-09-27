import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { OtpType, ResetPasswordRequestBody, UserIdentity, VerifyEmailRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { authnRateLimit } from '../../core/security/rate-limit'
import { userService } from '../../user/user-service'
import { authenticationUtils } from '../authentication-utils'
import { otpService } from '../otp/otp-service'
import { userIdentityService } from '../user-identity/user-identity-service'

export const localAuthnModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(localAuthnController, { prefix: '/v1/authn/local' })
}

const localAuthnController: FastifyPluginAsyncZod = async (app) => {
    app.post('/verify-email', VerifyEmailRequest, async (req) => {
        await assertOtpIsValid({
            identityId: req.body.identityId,
            otp: req.body.otp,
            type: OtpType.EMAIL_VERIFICATION,
            log: req.log,
        })
        return userIdentityService(req.log).verify(req.body.identityId)
    })

    app.post('/reset-password', ResetPasswordRequest, async (req, res) => {
        await assertOtpIsValid({
            identityId: req.body.identityId,
            otp: req.body.otp,
            type: OtpType.PASSWORD_RESET,
            log: req.log,
        })
        const memberships = await userService(req.log).getUsersByIdentityId({ identityId: req.body.identityId })
        await authenticationUtils(req.log).assertPasswordMeetsPolicy({
            password: req.body.newPassword,
            tenantIds: memberships.map((membership) => membership.tenantId).filter((tenantId): tenantId is string => !isNil(tenantId)),
        })
        await userIdentityService(req.log).updatePassword({
            id: req.body.identityId,
            newPassword: req.body.newPassword,
        })
        return res.code(StatusCodes.NO_CONTENT).send()
    })
}

async function assertOtpIsValid({ identityId, otp, type, log }: AssertOtpParams): Promise<void> {
    const valid = await otpService(log).confirm({ identityId, type, value: otp })
    if (!valid) {
        throw new ApplicationError({
            code: ErrorCode.INVALID_OTP,
            params: {},
        })
    }
}

const VerifyEmailRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: VerifyEmailRequestBody,
        response: {
            [StatusCodes.OK]: UserIdentity,
        },
    },
}

const ResetPasswordRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        body: ResetPasswordRequestBody,
    },
}

type AssertOtpParams = {
    identityId: string
    otp: string
    type: OtpType
    log: FastifyBaseLogger
}
