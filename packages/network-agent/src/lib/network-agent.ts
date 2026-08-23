import { NETWORK_AGENT_NAMESPACE, NetworkAgentEvent, ProxyRequest, ProxyResponse } from './tunnel-contract'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'

const HEARTBEAT_INTERVAL_MS = 30_000

export function createNetworkAgent(options: NetworkAgentOptions): NetworkAgent {
    const log = options.log ?? console
    let socket: Socket | null = null
    let heartbeat: NodeJS.Timeout | null = null

    function start(): void {
        socket = io(`${options.serverUrl.replace(/\/$/, '')}${NETWORK_AGENT_NAMESPACE}`, {
            path: '/api/socket.io',
            transports: ['websocket'],
            auth: { token: options.token },
            reconnection: true,
            reconnectionDelay: 1_000,
            reconnectionDelayMax: 30_000,
        })

        socket.on('connect', () => {
            log.info('[network-agent] connected')
            heartbeat = setInterval(() => socket?.emit(NetworkAgentEvent.HEARTBEAT), HEARTBEAT_INTERVAL_MS)
        })

        socket.on('disconnect', (reason: string) => {
            log.info(`[network-agent] disconnected: ${reason}`)
            clearHeartbeat()
        })

        socket.on(NetworkAgentEvent.PROXY_REQUEST, (request: ProxyRequest) => {
            void forward(request).then((response) => socket?.emit(NetworkAgentEvent.PROXY_RESPONSE, response))
        })
    }

    async function forward(request: ProxyRequest): Promise<ProxyResponse> {
        try {
            const response = await axios.request({
                method: request.method,
                url: request.url,
                headers: request.headers,
                data: request.body,
                timeout: request.timeoutMs,
                validateStatus: () => true,
            })
            return {
                requestId: request.requestId,
                status: response.status,
                headers: toStringHeaders(response.headers),
                body: response.data,
            }
        }
        catch (error) {
            return {
                requestId: request.requestId,
                error: error instanceof Error ? error.message : String(error),
            }
        }
    }

    function clearHeartbeat(): void {
        if (heartbeat !== null) {
            clearInterval(heartbeat)
            heartbeat = null
        }
    }

    function stop(): void {
        clearHeartbeat()
        socket?.disconnect()
        socket = null
    }

    return { start, stop }
}

function toStringHeaders(headers: unknown): Record<string, string> {
    if (typeof headers !== 'object' || headers === null) {
        return {}
    }
    return Object.fromEntries(
        Object.entries(headers)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)]),
    )
}

export type NetworkAgentOptions = {
    serverUrl: string
    token: string
    log?: { info: (message: string) => void }
}

type NetworkAgent = {
    start: () => void
    stop: () => void
}
