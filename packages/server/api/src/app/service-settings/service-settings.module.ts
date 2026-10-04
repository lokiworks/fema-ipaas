import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { serviceSettingsController } from './service-settings.controller'
import { serviceSettingsService } from './service-settings.service'

export const serviceSettingsModule: FastifyPluginAsyncZod = async (app) => {
    await serviceSettingsService(app.log).sync()
    serviceSettingsService(app.log).startSync()
    app.addHook('onClose', async () => {
        serviceSettingsService(app.log).stopSync()
    })
    await app.register(serviceSettingsController, { prefix: '/v1/service-settings' })
}
