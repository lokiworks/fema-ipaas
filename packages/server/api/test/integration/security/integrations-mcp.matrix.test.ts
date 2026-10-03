import { TenantModule } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { integrationsMcpCases } from './cases/integrations-mcp'
import { integrationsSeed } from './support/integrations-seed'
import { securityMatrix } from './support/matrix'
import { securityWorld, World } from './support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
    await integrationsSeed.grantModules({ world, modules: [TenantModule.CONNECTOR_DEVELOPMENT, TenantModule.MCP_SERVICES] })
}, 300_000)

securityMatrix.describeMatrix({ name: 'integrations mcp', getWorld: () => world!, cases: integrationsMcpCases })
