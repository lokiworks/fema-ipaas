import { FastifyInstance } from 'fastify'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { workspaceBatchCases, workspaceFolderCases } from './cases/workspace-folders'
import { securityMatrix } from './support/matrix'
import { securityWorld, World } from './support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

securityMatrix.describeMatrix({ name: 'workspace folders', getWorld: () => world!, cases: workspaceFolderCases })
securityMatrix.describeMatrix({ name: 'workspace batch', getWorld: () => world!, cases: workspaceBatchCases })
