import { apId, ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { apDayjs } from '@fema-ipaas/server-utils'
import { ApplicationEventName, NetworkAgentEvent, NetworkAgentStatus, ProxyResponse } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { Socket } from 'socket.io'
import { auditEventService } from '../audit/audit-event.service'
import { encryptUtils } from '../helper/encryption'
import { networkAgentAllowlist } from './network-agent-allowlist'
import { networkAgentRepo } from './network-agent.repo'

const DEFAULT_TIMEOUT_MS = 30_000

const connectedAgents = new Map<string, Socket>()
const pendingRequests = new Map<string, PendingRequest>()

export const networkAgentTunnel = {
    async onConnection(socket: Socket, log: FastifyBaseLogger): Promise<void> {
        const agent = await authenticate(socket)
        if (isNil(agent)) {
            log.warn({ socket: { id: socket.id } }, '[networkAgentTunnel] rejected an agent with an unknown token')
            socket.disconnect(true)
            return
        }

        connectedAgents.set(agent.id, socket)
        await markOnline(agent.id)
        log.info({ networkAgent: { id: agent.id, displayName: agent.displayName } }, '[networkAgentTunnel] agent connected')
        socket.emit(NetworkAgentEvent.REGISTERED, { networkAgentId: agent.id })

        socket.on(NetworkAgentEvent.HEARTBEAT, () => {
            void markOnline(agent.id)
        })

        socket.on(NetworkAgentEvent.PROXY_RESPONSE, (response: ProxyResponse) => {
            const pending = pendingRequests.get(response.requestId)
            if (isNil(pending)) {
                return
            }
            pendingRequests.delete(response.requestId)
            clearTimeout(pending.timer)
            pending.resolve(response)
        })

        socket.on('disconnect', () => {
            if (connectedAgents.get(agent.id) === socket) {
                connectedAgents.delete(agent.id)
                void markOffline(agent.id)
            }
            log.info({ networkAgent: { id: agent.id } }, '[networkAgentTunnel] agent disconnected')
        })
    },

    isOnline(networkAgentId: string): boolean {
        return connectedAgents.has(networkAgentId)
    },

    async proxy({ log, tenantId, networkAgentId, method, url, headers, body }: ProxyParams): Promise<ProxyResponse> {
        const agent = await networkAgentRepo().findOneBy({ id: networkAgentId, tenantId })
        if (isNil(agent)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'network_agent', entityId: networkAgentId },
            })
        }
        if (agent.status === NetworkAgentStatus.DISABLED) {
            throw new Error(`Network agent "${agent.displayName}" is disabled`)
        }
        networkAgentAllowlist.assertAllowed({
            url,
            hostAllowlist: agent.hostAllowlist,
            cidrAllowlist: agent.cidrAllowlist,
        })

        const socket = connectedAgents.get(networkAgentId)
        if (isNil(socket)) {
            throw new Error(`Network agent "${agent.displayName}" is not connected`)
        }

        const requestId = apId()
        const response = await dispatch({ socket, requestId, method, url, headers: headers ?? {}, body })
        await auditEventService(log).record({
            tenantId,
            workspaceId: agent.workspaceId,
            action: ApplicationEventName.NETWORK_AGENT_REQUEST,
            data: {
                networkAgent: { id: agent.id, displayName: agent.displayName },
                request: { method, url },
                response: { status: response.status ?? 0, error: response.error ?? null },
            },
        })
        return response
    },
}

function dispatch({ socket, requestId, method, url, headers, body }: DispatchParams): Promise<ProxyResponse> {
    return new Promise<ProxyResponse>((resolve) => {
        const timer = setTimeout(() => {
            pendingRequests.delete(requestId)
            resolve({ requestId, error: `Network agent did not answer within ${DEFAULT_TIMEOUT_MS}ms` })
        }, DEFAULT_TIMEOUT_MS)
        pendingRequests.set(requestId, { resolve, timer })
        socket.emit(NetworkAgentEvent.PROXY_REQUEST, {
            requestId,
            method,
            url,
            headers,
            body,
            timeoutMs: DEFAULT_TIMEOUT_MS,
        })
    })
}

async function authenticate(socket: Socket) {
    const token = socket.handshake.auth?.token
    if (typeof token !== 'string' || token.length === 0) {
        return null
    }
    const tokenHash = await encryptUtils.hmacString(token)
    return networkAgentRepo().findOneBy({ tokenHash })
}

async function markOnline(networkAgentId: string): Promise<void> {
    await networkAgentRepo().update(networkAgentId, {
        status: NetworkAgentStatus.ONLINE,
        lastSeenAt: apDayjs().toISOString(),
    })
}

async function markOffline(networkAgentId: string): Promise<void> {
    await networkAgentRepo().update(networkAgentId, { status: NetworkAgentStatus.OFFLINE })
}

type PendingRequest = {
    resolve: (response: ProxyResponse) => void
    timer: NodeJS.Timeout
}

type DispatchParams = {
    socket: Socket
    requestId: string
    method: string
    url: string
    headers: Record<string, string>
    body?: unknown
}

type ProxyParams = {
    log: FastifyBaseLogger
    tenantId: string
    networkAgentId: string
    method: string
    url: string
    headers?: Record<string, string>
    body?: unknown
}
