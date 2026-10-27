import { ApplicationError, ErrorCode, isNil, Permission, ProjectRole } from '@fema-ipaas/core-utils'
import { ApiToWorkerContract, createNotifyClient, Principal, PrincipalForType, PrincipalType, WebsocketServerEvent } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { Socket } from 'socket.io'
import { accessTokenManager } from '../authentication/lib/access-token-manager'
import { rejectedPromiseHandler } from '../helper/promise-handler'
import { projectAccess } from '../project/project-access'
import { app } from '../server'

export type WebsocketListener<T, PR extends PrincipalType.USER | PrincipalType.WORKER> = (socket: Socket) => (data: T, principal: PrincipalForType<PR>, projectId: PR extends PrincipalType.USER ? string : null, callback?: (data: unknown) => void) => Promise<void>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ListenerMap<PR extends PrincipalType.USER | PrincipalType.WORKER> = Partial<Record<WebsocketServerEvent, WebsocketListener<any, PR>>>

const WORKERS_ROOM = 'WORKERS'

const listener = {
    [PrincipalType.USER]: {} as ListenerMap<PrincipalType.USER>,
    [PrincipalType.WORKER]: {} as ListenerMap<PrincipalType.WORKER>,
}

const eventPermissions: Partial<Record<WebsocketServerEvent, Permission>> = {}

export const websocketService = {
    to: (workerId: string) => app!.io.to(workerId),
    async socketsIn(room: string): Promise<RoomSocket[]> {
        const sockets = await app!.io.in(room).fetchSockets()
        return sockets.map((socket) => ({
            id: socket.id,
            userId: typeof socket.data?.userId === 'string' ? socket.data.userId : null,
        }))
    },
    notifyWorkers: () => createNotifyClient<ApiToWorkerContract>(app!.io.to(WORKERS_ROOM)),
    async init(socket: Socket, log: FastifyBaseLogger): Promise<void> {
        const session = establishSession({ socket, log })
        bindListeners({ socket, session, log })
        await session
    },
    async verifyPrincipal(socket: Socket): Promise<Principal> {
        return accessTokenManager(app!.log).verifyPrincipal(socket.handshake.auth.token)
    },
    addListener<T, PR extends PrincipalType.WORKER | PrincipalType.USER>(principalType: PR, event: WebsocketServerEvent, handler: WebsocketListener<T, PR>, permission?: Permission): void {
        switch (principalType) {
            case PrincipalType.USER: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                listener[PrincipalType.USER][event] = handler as unknown as WebsocketListener<any, PrincipalType.USER>
                if (!isNil(permission)) {
                    eventPermissions[event] = permission
                }
                break
            }
            case PrincipalType.WORKER: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                listener[PrincipalType.WORKER][event] = handler as unknown as WebsocketListener<any, PrincipalType.WORKER>
                break
            }
        }
    },
    emitWithAck<T = unknown>(event: WebsocketServerEvent, workerId: string, data?: unknown): Promise<T> {
        return app!.io.to([workerId]).timeout(4000).emitWithAck(event, data)
    },
}

const establishSession = async ({ socket, log }: { socket: Socket, log: FastifyBaseLogger }): Promise<Session | null> => {
    const principal = await websocketService.verifyPrincipal(socket)
    switch (principal.type) {
        case PrincipalType.USER: {
            const projectId = socket.handshake.auth.projectId
            const projectRole = await validateProjectId({ userId: principal.id, projectId, log })
            log.info({
                message: 'User connected',
                user: { id: principal.id },
                project: { id: projectId },
            })
            socket.data.userId = principal.id
            await socket.join(projectId)
            await socket.join(principal.id)
            return { type: PrincipalType.USER, principal, projectId, projectRole }
        }
        case PrincipalType.WORKER: {
            const workerId = socket.handshake.auth.workerId
            log.info({
                message: 'Worker connected',
                worker: { id: workerId },
            })
            await socket.join(workerId)
            await socket.join(WORKERS_ROOM)
            return { type: PrincipalType.WORKER, principal }
        }
        default: {
            return null
        }
    }
}

const bindListeners = ({ socket, session, log }: { socket: Socket, session: Promise<Session | null>, log: FastifyBaseLogger }): void => {
    const events = Object.values(WebsocketServerEvent).filter((event) =>
        !isNil(listener[PrincipalType.USER][event]) || !isNil(listener[PrincipalType.WORKER][event]),
    )
    for (const event of events) {
        const socketEvent: string = event === WebsocketServerEvent.DISCONNECT ? 'disconnect' : event
        socket.on(socketEvent, async (data, callback) => {
            const resolved = await session.catch(() => null)
            if (isNil(resolved)) {
                return
            }
            if (resolved.type === PrincipalType.USER) {
                const userHandler = listener[PrincipalType.USER][event]
                const requiredPermission = eventPermissions[event]
                if (isNil(userHandler)) {
                    return
                }
                if (!isNil(requiredPermission) && !hasPermission(resolved.projectRole, requiredPermission)) {
                    log.warn({ event, userId: resolved.principal.id, projectId: resolved.projectId, requiredPermission }, 'Websocket event blocked: missing permission')
                    return
                }
                return rejectedPromiseHandler(userHandler(socket)(data, resolved.principal, resolved.projectId, callback), log)
            }
            const workerHandler = listener[PrincipalType.WORKER][event]
            if (isNil(workerHandler)) {
                return
            }
            return rejectedPromiseHandler(workerHandler(socket)(data, resolved.principal, null, callback), log)
        })
    }
}

const validateProjectId = async ({ userId, projectId, log }: ValidateProjectIdArgs): Promise<ProjectRole> => {
    if (isNil(projectId)) {
        throw new ApplicationError({
            code: ErrorCode.AUTHENTICATION,
            params: {
                message: 'Project ID is required',
            },
        })
    }
    const role = await projectAccess(log).resolveRole({
        projectId,
        userId,
    })

    if (isNil(role)) {
        throw new ApplicationError({
            code: ErrorCode.AUTHORIZATION,
            params: {
                message: 'User not allowed to access this project',
            },
        })
    }
    return role
}

function hasPermission(role: ProjectRole | undefined, permission: Permission): boolean {
    return !isNil(role) && (role.permissions ?? []).includes(permission)
}

type Session = {
    type: PrincipalType.USER
    principal: PrincipalForType<PrincipalType.USER>
    projectId: string
    projectRole: ProjectRole
} | {
    type: PrincipalType.WORKER
    principal: PrincipalForType<PrincipalType.WORKER>
}

type RoomSocket = {
    id: string
    userId: string | null
}

type ValidateProjectIdArgs = {
    userId: string
    projectId?: string
    log: FastifyBaseLogger
}