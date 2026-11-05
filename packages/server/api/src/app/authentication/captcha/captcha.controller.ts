import { CaptchaChallenge } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { authnRateLimit } from '../../core/security/rate-limit'
import { captcha } from './captcha'

export const captchaController: FastifyPluginAsyncZod = async (app) => {
    app.get('/challenge', CaptchaChallengeRequest, async (): Promise<CaptchaChallenge> => {
        return captcha.createChallenge()
    })
}

const CaptchaChallengeRequest = {
    config: {
        security: securityAccess.public(),
        rateLimit: authnRateLimit,
    },
    schema: {
        response: {
            [StatusCodes.OK]: CaptchaChallenge,
        },
    },
}
