import { FastifyInstance } from 'fastify'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { runtimeTenantCases } from './cases/runtime-tenant'
import { securityMatrix } from './support/matrix'
import { securityWorld, World } from './support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

securityMatrix.describeMatrix({ name: 'runtime tenant-wide', getWorld: () => world!, cases: runtimeTenantCases })
