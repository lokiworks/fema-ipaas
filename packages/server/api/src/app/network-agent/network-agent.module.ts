import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { networkAgentController } from './network-agent.controller'

export const networkAgentModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(networkAgentController, { prefix: '/v1/network-agents' })
}
