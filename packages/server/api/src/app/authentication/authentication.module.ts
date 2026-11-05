import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { authenticationController } from './authentication.controller'
import { captchaController } from './captcha/captcha.controller'
import { mfaController } from './mfa/mfa.controller'
import { smsAuthController } from './sms/sms-auth.controller'

export const authenticationModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(authenticationController, {
        prefix: '/v1/authentication',
    })
    await app.register(captchaController, {
        prefix: '/v1/authentication/captcha',
    })
    await app.register(smsAuthController, {
        prefix: '/v1/authentication/sms',
    })
    await app.register(mfaController, {
        prefix: '/v1/authentication/mfa',
    })
}
