import { FastifyInstance } from 'fastify'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { integrationsAiCases } from './cases/integrations-ai'
import { securityMatrix } from './support/matrix'
import { securityWorld, World } from './support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
}, 300_000)

securityMatrix.describeMatrix({ name: 'integrations ai', getWorld: () => world!, cases: integrationsAiCases })
