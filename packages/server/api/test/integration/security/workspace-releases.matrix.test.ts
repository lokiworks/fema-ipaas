import { FastifyInstance } from 'fastify'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { workspaceReleaseCases } from './cases/workspace-releases'
import { securityMatrix } from './support/matrix'
import { securityWorld, World } from './support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

securityMatrix.describeMatrix({ name: 'workspace releases', getWorld: () => world!, cases: workspaceReleaseCases })
