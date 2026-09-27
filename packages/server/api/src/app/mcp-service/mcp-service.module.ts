import { TenantModule } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { entitiesMustBeOwnedByCurrentProject } from '../authentication/authorization'
import { tenantModuleGuard } from '../tenant-access/tenant-module-guard'
import { mcpEndpointController } from './mcp-endpoint.controller'
import { mcpServiceController } from './mcp-service.controller'

export const mcpServiceModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(mcpServiceManagementModule)
    await app.register(mcpEndpointController, { prefix: '/v1/mcp' })
}

const mcpServiceManagementModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preSerialization', entitiesMustBeOwnedByCurrentProject)
    app.addHook('preHandler', tenantModuleGuard.requireModule(TenantModule.MCP_SERVICES))
    await app.register(mcpServiceController, { prefix: '/v1/mcp-services' })
}
