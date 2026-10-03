import { generateId } from '@fema-ipaas/core-utils'
import { WebsocketServerEvent } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { websocketService } from '../../../../src/app/core/websockets.service'
import { setupTestEnvironment } from '../../../helpers/test-setup'
import { seed } from '../support/seed'
import { Identity, Scope, securityWorld, World } from '../support/world'

let world: World | null = null
let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

function currentWorld(): World {
    if (world === null) {
        throw new Error('world is not ready')
    }
    return world
}

type FakeClient = {
    send: (params: { event: WebsocketServerEvent, data: unknown }) => Promise<unknown>
    joinedRooms: string[]
    registeredEvents: () => string[]
}

async function connect({ identity, projectScope }: { identity: Identity, projectScope: Scope }): Promise<FakeClient> {
    const w = currentWorld()
    const handlers = new Map<string, (data: unknown, callback?: (reply: unknown) => void) => Promise<void> | void>()
    const joinedRooms: string[] = []
    const socket = {
        handshake: { auth: { token: w.actors[identity].token, projectId: w.scopes[projectScope].project.id } },
        data: {} as Record<string, unknown>,
        id: generateId(),
        join: async (room: string) => {
            joinedRooms.push(room)
        },
        on: (event: string, handler: (data: unknown, callback?: (reply: unknown) => void) => Promise<void> | void) => {
            handlers.set(event, handler)
        },
        once: () => undefined,
        emit: () => true,
        to: () => ({ emit: () => true }),
    }
    await websocketService.init(socket as never, app!.log).catch(() => undefined)
    return {
        joinedRooms,
        registeredEvents: () => [...handlers.keys()],
        send: ({ event, data }) => new Promise((resolve) => {
            const handler = handlers.get(event)
            if (handler === undefined) {
                resolve('no-handler')
                return
            }
            const timer = setTimeout(() => resolve('no-reply'), 1500)
            void handler(data, (reply) => {
                clearTimeout(timer)
                resolve(reply)
            })
        }),
    }
}

describe('realtime collaboration stays inside the project and the role of the connection', () => {
    it('does not register any handler or room for a user who asks for a project they cannot open', async () => {
        const outsider = await connect({ identity: 'projectAdmin', projectScope: 'B' })
        const foreignTenant = await connect({ identity: 'otherTenantAdmin', projectScope: 'A' })

        expect(outsider.joinedRooms).toEqual([])
        expect(outsider.registeredEvents()).toEqual([])
        expect(foreignTenant.joinedRooms).toEqual([])
        expect(foreignTenant.registeredEvents()).toEqual([])
    })

    it('does not let a viewer take the edit lock of a workflow, which would stop the developers from publishing', async () => {
        const w = currentWorld()
        const workflow = await seed.workflow({ world: w, scope: 'A' })
        const viewer = await connect({ identity: 'viewer', projectScope: 'A' })
        const developer = await connect({ identity: 'developer', projectScope: 'A' })

        const viewerAttempt = await viewer.send({ event: WebsocketServerEvent.LOCK_RESOURCE, data: { resourceId: workflow.id } })
        const developerAttempt = await developer.send({ event: WebsocketServerEvent.LOCK_RESOURCE, data: { resourceId: workflow.id } })

        expect(viewerAttempt).not.toMatchObject({ acquired: true })
        expect(developerAttempt).toMatchObject({ acquired: true })
    })

    it('does not let a member lock or force take over a workflow of another project', async () => {
        const w = currentWorld()
        const foreign = await seed.workflow({ world: w, scope: 'B' })
        const foreignOwner = await connect({ identity: 'foreignProjectAdmin', projectScope: 'B' })
        const projectAdmin = await connect({ identity: 'projectAdmin', projectScope: 'A' })

        const ownerLock = await foreignOwner.send({ event: WebsocketServerEvent.LOCK_RESOURCE, data: { resourceId: foreign.id } })
        const plainAttempt = await projectAdmin.send({ event: WebsocketServerEvent.LOCK_RESOURCE, data: { resourceId: foreign.id } })
        const forcedAttempt = await projectAdmin.send({ event: WebsocketServerEvent.LOCK_RESOURCE, data: { resourceId: foreign.id, force: true } })

        expect(ownerLock).toMatchObject({ acquired: true })
        expect(plainAttempt).not.toMatchObject({ acquired: true })
        expect(forcedAttempt).not.toMatchObject({ acquired: true })
    })

    it('does not tell a member who is working on a workflow of another project', async () => {
        const w = currentWorld()
        const foreign = await seed.workflow({ world: w, scope: 'B' })
        const foreignOwner = await connect({ identity: 'foreignProjectAdmin', projectScope: 'B' })
        const spy = await connect({ identity: 'viewer', projectScope: 'A' })

        const own = await foreignOwner.send({ event: WebsocketServerEvent.JOIN_PRESENCE, data: { resourceId: foreign.id } })
        const spied = await spy.send({ event: WebsocketServerEvent.JOIN_PRESENCE, data: { resourceId: foreign.id } })

        expect(JSON.stringify(own)).toContain('users')
        expect(JSON.stringify(spied)).not.toContain(w.actors.foreignProjectAdmin.userId as string)
    })

    it('does not forward an edit request to the lock holder of a workflow of another project', async () => {
        const w = currentWorld()
        const foreign = await seed.workflow({ world: w, scope: 'B' })
        const foreignOwner = await connect({ identity: 'foreignProjectAdmin', projectScope: 'B' })
        const stranger = await connect({ identity: 'developer', projectScope: 'A' })

        await foreignOwner.send({ event: WebsocketServerEvent.LOCK_RESOURCE, data: { resourceId: foreign.id } })
        const reply = await stranger.send({ event: WebsocketServerEvent.REQUEST_RESOURCE_EDIT, data: { resourceId: foreign.id } })

        expect(reply).not.toMatchObject({ sent: true })
    })
})
