import { DefaultProjectRole, isNil, LockResourceRequest, Permission, PrincipalType, RequestResourceEditRequest, WebsocketClientEvent, WebsocketServerEvent } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { projectAccess } from '../../../project/project-access'
import { userService } from '../../../user/user-service'
import { websocketService } from '../../websockets.service'
import { collaborationGuard } from '../collaboration-guard'
import { lockSideEffects } from './lock-side-effects'
import { lockService } from './lock.service'

export const lockModule: FastifyPluginAsyncZod = async (app) => {
    websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.LOCK_RESOURCE, (socket) => {
        return async (data: LockResourceRequest, principal, projectId, callback) => {
            app.log.info({ resourceId: data.resourceId }, '[Lock] LOCK_RESOURCE event received')
            try {
                if (!(await collaborationGuard.isWorkflowOfProject({ resourceId: data.resourceId, projectId }))) {
                    callback?.({ acquired: false, lock: null, reason: 'NOT_ALLOWED' })
                    return
                }
                const user = await userService(app.log).getMetaInformation({ id: principal.id })
                const displayName = `${user.firstName} ${user.lastName}`
                if (data.force === true && !(await canTakeOver({ app, projectId, userId: principal.id }))) {
                    const current = await lockService(app.log).getLock({ resourceId: data.resourceId })
                    callback?.({ acquired: false, lock: current, reason: 'NOT_ALLOWED' })
                    return
                }

                const result = await lockService(app.log).acquire({
                    resourceId: data.resourceId,
                    userId: principal.id,
                    userDisplayName: displayName,
                    force: data.force,
                    active: data.active,
                })

                if (result.acquired) {
                    socket.data.lockedResourceId = data.resourceId
                    const lockedEvent = {
                        resourceId: data.resourceId,
                        userId: principal.id,
                        userDisplayName: displayName,
                        ...(isNil(result.previousUserId) ? {} : { previousUserId: result.previousUserId, takenOver: result.takenOver }),
                    }
                    socket.to(projectId).emit(WebsocketClientEvent.RESOURCE_LOCKED, lockedEvent)
                    if (result.takenOver === true && !isNil(result.previousUserId) && result.previousUserId !== principal.id) {
                        await lockSideEffects(app.log).onTakenOver({
                            resourceId: data.resourceId,
                            projectId,
                            tenantId: principal.tenant.id,
                            previousUserId: result.previousUserId,
                            actorId: principal.id,
                        })
                    }
                }

                registerLockDisconnectHandler({ socket, userId: principal.id, projectId, app })

                callback?.({ acquired: result.acquired, lock: result.lock, ...(result.acquired ? {} : { reason: 'LOCKED' }) })
            }
            catch (error) {
                app.log.error({ error }, '[LOCK_RESOURCE] Failed to acquire lock')
                callback?.({ acquired: false, lock: null })
            }
        }
    }, Permission.WRITE_WORKFLOW)
    websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.UNLOCK_RESOURCE, (socket) => {
        return async (data: { resourceId: string }, principal, projectId) => {
            try {
                const released = await lockService(app.log).release({
                    resourceId: data.resourceId,
                    userId: principal.id,
                })
                socket.data.lockedResourceId = null
                if (released) {
                    websocketService.to(projectId).emit(WebsocketClientEvent.RESOURCE_UNLOCKED, {
                        resourceId: data.resourceId,
                    })
                }
            }
            catch (error) {
                app.log.error({ error }, '[UNLOCK_RESOURCE] Failed to release lock')
            }
        }
    })
    websocketService.addListener(PrincipalType.USER, WebsocketServerEvent.REQUEST_RESOURCE_EDIT, () => {
        return async (data: RequestResourceEditRequest, principal, projectId, callback) => {
            try {
                if (!(await collaborationGuard.isWorkflowOfProject({ resourceId: data.resourceId, projectId }))) {
                    callback?.({ sent: false })
                    return
                }
                const lock = await lockService(app.log).getLock({ resourceId: data.resourceId })
                if (isNil(lock) || lock.userId === principal.id) {
                    callback?.({ sent: false })
                    return
                }
                const user = await userService(app.log).getMetaInformation({ id: principal.id })
                websocketService.to(lock.userId).emit(WebsocketClientEvent.RESOURCE_EDIT_REQUESTED, {
                    resourceId: data.resourceId,
                    holderUserId: lock.userId,
                    requesterUserId: principal.id,
                    requesterDisplayName: `${user.firstName} ${user.lastName}`,
                })
                callback?.({ sent: true })
            }
            catch (error) {
                app.log.error({ error }, '[REQUEST_RESOURCE_EDIT] Failed to send the edit request')
                callback?.({ sent: false })
            }
        }
    }, Permission.WRITE_WORKFLOW)
}

async function canTakeOver({ app, projectId, userId }: { app: FastifyInstance, projectId: string, userId: string }): Promise<boolean> {
    const role = await projectAccess(app.log).resolveRole({ projectId, userId })
    return role?.name === DefaultProjectRole.ADMIN
}

function registerLockDisconnectHandler({ socket, userId, projectId, app }: RegisterDisconnectHandlerParams): void {
    if (socket.data.lockDisconnectRegistered) {
        return
    }
    socket.data.lockDisconnectRegistered = true
    socket.once('disconnect', async () => {
        const lockedResourceId = socket.data.lockedResourceId
        if (typeof lockedResourceId === 'string') {
            const released = await lockService(app.log).release({
                resourceId: lockedResourceId,
                userId,
            })
            if (released) {
                websocketService.to(projectId).emit(WebsocketClientEvent.RESOURCE_UNLOCKED, {
                    resourceId: lockedResourceId,
                })
            }
        }
    })
}

type RegisterDisconnectHandlerParams = {
    socket: { data: Record<string, unknown>, once: (event: string, handler: () => void) => void, id: string }
    userId: string
    projectId: string
    app: FastifyInstance
}
