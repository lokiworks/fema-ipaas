import { FastifyInstance } from 'fastify'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { workspaceSolutionCases, workspaceTemplateCases } from './cases/workspace-solutions'
import { securityMatrix } from './support/matrix'
import { securityWorld, World } from './support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

securityMatrix.describeMatrix({ name: 'workspace solutions', getWorld: () => world!, cases: workspaceSolutionCases })
securityMatrix.describeMatrix({ name: 'workspace templates', getWorld: () => world!, cases: workspaceTemplateCases })
