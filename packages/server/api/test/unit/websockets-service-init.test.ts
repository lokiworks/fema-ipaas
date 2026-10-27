import { EventEmitter } from 'node:events'
import { Permission } from '@fema-ipaas/core-utils'
import { PrincipalType, WebsocketServerEvent } from '@fema-ipaas/shared'
import { Socket } from 'socket.io'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyPrincipal = vi.fn()
const resolveRole = vi.fn()

vi.mock('../../src/app/server', () => ({ app: { log: {}, io: {} } }))
vi.mock('../../src/app/authentication/lib/access-token-manager', () => ({
    accessTokenManager: () => ({ verifyPrincipal }),
}))
vi.mock('../../src/app/project/project-access', () => ({
    projectAccess: () => ({ resolveRole }),
}))

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function createSocket(): Socket {
    const emitter = new EventEmitter()
    const socket = Object.assign(emitter, {
        data: {},
        handshake: { auth: { token: 'token', projectId: 'project_1' } },
        join: vi.fn().mockResolvedValue(undefined),
    })
    return Object.assign(socket)
}

function deferred<T>(): { promise: Promise<T>, resolve: (value: T) => void } {
    let resolve: (value: T) => void = () => undefined
    const promise = new Promise<T>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

describe('websocketService.init', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('runs an event emitted before project validation finishes', async () => {
        const { websocketService } = await import('../../src/app/core/websockets.service')
        const handler = vi.fn().mockResolvedValue(undefined)
        websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.TEST_EXECUTION, () => handler)
        verifyPrincipal.mockResolvedValue({ id: 'user_1', type: PrincipalType.USER })
        const role = deferred<{ permissions: string[] }>()
        resolveRole.mockReturnValue(role.promise)
        const socket = createSocket()

        const init = websocketService.init(socket, log as never)
        socket.emit(WebsocketServerEvent.TEST_EXECUTION, { workflowId: 'w1' })
        await Promise.resolve()
        expect(handler).not.toHaveBeenCalled()

        role.resolve({ permissions: [] })
        await init
        await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
        expect(handler).toHaveBeenCalledWith({ workflowId: 'w1' }, expect.objectContaining({ id: 'user_1' }), 'project_1', undefined)
    })

    it('drops events when the project check fails', async () => {
        const { websocketService } = await import('../../src/app/core/websockets.service')
        const handler = vi.fn().mockResolvedValue(undefined)
        websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.TEST_EXECUTION, () => handler)
        verifyPrincipal.mockResolvedValue({ id: 'user_1', type: PrincipalType.USER })
        resolveRole.mockResolvedValue(null)
        const socket = createSocket()

        const init = websocketService.init(socket, log as never)
        socket.emit(WebsocketServerEvent.TEST_EXECUTION, {})
        await expect(init).rejects.toThrow()
        await new Promise((done) => setTimeout(done, 10))
        expect(handler).not.toHaveBeenCalled()
    })

    it('blocks events whose permission the role lacks', async () => {
        const { websocketService } = await import('../../src/app/core/websockets.service')
        const handler = vi.fn().mockResolvedValue(undefined)
        websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.TEST_EXECUTION, () => handler, Permission.WRITE_WORKFLOW)
        verifyPrincipal.mockResolvedValue({ id: 'user_1', type: PrincipalType.USER })
        resolveRole.mockResolvedValue({ permissions: [] })
        const socket = createSocket()

        const init = websocketService.init(socket, log as never)
        socket.emit(WebsocketServerEvent.TEST_EXECUTION, {})
        await init
        await new Promise((done) => setTimeout(done, 10))
        expect(handler).not.toHaveBeenCalled()
        expect(log.warn).toHaveBeenCalled()
    })
})
