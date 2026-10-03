import { isNil } from '@fema-ipaas/core-utils'
import { ConnectionSharePermission, PLACEHOLDER_CONNECTION_TYPE } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { db } from '../../../helpers/db'
import { setupTestEnvironment } from '../../../helpers/test-setup'
import { integrationsSeed, SeededConnection } from '../support/integrations-seed'
import { Identity, securityWorld, World, WorldResponse } from '../support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

function currentWorld(): World {
    if (isNil(world)) {
        throw new Error('world is not ready')
    }
    return world
}

async function placeholderAs({ identity, existing }: { identity: Identity, existing: SeededConnection }): Promise<WorldResponse> {
    const current = currentWorld()
    return current.send({
        identity,
        request: {
            method: 'POST',
            url: '/v1/connections',
            body: {
                externalId: existing.externalId,
                displayName: 'sec-placeholder-probe',
                connectorName: integrationsSeed.CONNECTOR_NAME,
                projectId: current.scopes.A.project.id,
                type: PLACEHOLDER_CONNECTION_TYPE,
                connectorVersion: '0.0.0',
            },
        },
    })
}

describe('placeholder upsert never reveals a connection the caller cannot see', () => {
    it('refuses a placeholder over a private connection owned by someone else', async () => {
        const privateConnection = await integrationsSeed.connection({ world: currentWorld(), scope: 'A', projectMembersPermission: null })

        const response = await placeholderAs({ identity: 'operator', existing: privateConnection })

        expect([403, 404]).toContain(response.status)
        expect(response.text).not.toContain(privateConnection.displayName)
        const row = await db.findOneBy<{ displayName: string }>('connection', { id: privateConnection.id })
        expect(row?.displayName).toBe(privateConnection.displayName)
    })

    it('still answers with the existing connection when it is shared with the caller', async () => {
        const shared = await integrationsSeed.connection({ world: currentWorld(), scope: 'A', projectMembersPermission: ConnectionSharePermission.USE })

        const response = await placeholderAs({ identity: 'operator', existing: shared })

        expect(response.status).toBe(201)
        expect(JSON.parse(response.text).id).toBe(shared.id)
    })

    it('still answers the owner with the existing connection', async () => {
        const own = await integrationsSeed.connection({ world: currentWorld(), scope: 'A', projectMembersPermission: null })

        const response = await placeholderAs({ identity: 'tenantAdmin', existing: own })

        expect(response.status).toBe(201)
        expect(JSON.parse(response.text).id).toBe(own.id)
    })

    it('creates a placeholder when nothing exists under that identifier', async () => {
        const current = currentWorld()

        const response = await current.send({
            identity: 'operator',
            request: {
                method: 'POST',
                url: '/v1/connections',
                body: {
                    externalId: `ext-fresh-${current.newId().toLowerCase()}`,
                    displayName: 'sec-fresh-placeholder',
                    connectorName: integrationsSeed.CONNECTOR_NAME,
                    projectId: current.scopes.A.project.id,
                    type: PLACEHOLDER_CONNECTION_TYPE,
                    connectorVersion: '0.0.0',
                },
            },
        })

        expect(response.status).toBe(201)
    })
})
