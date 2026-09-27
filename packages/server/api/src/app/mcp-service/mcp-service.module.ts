import { TenantModule } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { entitiesMustBeOwnedByCurrentProject } from '../authentication/authorization'
import { tenantModuleGuard } from '../tenant-access/tenant-module-guard'
import { mcpCallbackController } from './mcp-callback.controller'
import { mcpEndpointController, mcpKeyEndpointController } from './mcp-endpoint.controller'
import { mcpServiceController } from './mcp-service.controller'

export const mcpServiceModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(mcpServiceManagementModule)
    await app.register(mcpEndpointController, { prefix: '/v1/mcp' })
    await app.register(mcpKeyEndpointController, { prefix: '/mcp' })
    await app.register(mcpCallbackController, { prefix: '/v1/mcp-callbacks' })
}

const mcpServiceManagementModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)
    app.addHook('preHandler', tenantModuleGuard.requireModule(TenantModule.MCP_SERVICES))
    await app.register(mcpServiceController, { prefix: '/v1/mcp-services' })
}
