import { FastifyInstance } from 'fastify'
import { setupTestEnvironment } from '../../helpers/test-setup'
import { runtimeAlertAuditCases } from './cases/runtime-infra'
import { runtimePlatformCases } from './cases/runtime-platform'
import { securityMatrix } from './support/matrix'
import { runtimeSeed } from './support/runtime-seed'
import { securityWorld, World } from './support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
    await runtimeSeed.makeFirstTenantPrimary({ world })
})

securityMatrix.describeMatrix({ name: 'runtime alerts and audit', getWorld: () => world!, cases: runtimeAlertAuditCases })
securityMatrix.describeMatrix({ name: 'runtime platform', getWorld: () => world!, cases: runtimePlatformCases })
