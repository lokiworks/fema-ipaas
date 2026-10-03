import { FastifyInstance } from 'fastify'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { runtimeExecutionCases } from './cases/runtime-executions'
import { runtimeRunCases } from './cases/runtime-runs'
import { securityMatrix } from './support/matrix'
import { securityWorld, World } from './support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

securityMatrix.describeMatrix({ name: 'runtime executions', getWorld: () => world!, cases: runtimeExecutionCases })
securityMatrix.describeMatrix({ name: 'runtime run logs and approvals', getWorld: () => world!, cases: runtimeRunCases })
