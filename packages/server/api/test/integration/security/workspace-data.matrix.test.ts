import { FastifyInstance } from 'fastify'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { workspaceDataStoreCases, workspaceMappingTableCases, workspaceVariableCases } from './cases/workspace-data'
import { securityMatrix } from './support/matrix'
import { securityWorld, World } from './support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

securityMatrix.describeMatrix({ name: 'workspace variables', getWorld: () => world!, cases: workspaceVariableCases })
securityMatrix.describeMatrix({ name: 'workspace data stores', getWorld: () => world!, cases: workspaceDataStoreCases })
securityMatrix.describeMatrix({ name: 'workspace mapping tables', getWorld: () => world!, cases: workspaceMappingTableCases })
