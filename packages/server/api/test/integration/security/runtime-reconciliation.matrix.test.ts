import { setupTestEnvironment } from '../../helpers/test-setup'
import { runtimeReconciliationCases } from './cases/runtime-reconciliation'
import { securityMatrix } from './support/matrix'
import { securityWorld, World } from './support/world'

let world: World | undefined
beforeAll(async () => { world = await securityWorld.build({ app: await setupTestEnvironment() }) })
securityMatrix.describeMatrix({ name: 'reconciliation and async verification', getWorld: () => { if (!world) throw new Error('Missing security world'); return world }, cases: runtimeReconciliationCases })
