// The agent is installed inside a customer network and must stay a small, auditable binary, so it
// declares the wire format itself instead of depending on @fema-ipaas/shared. The server-side copy
// lives in packages/core/shared/src/lib/management/network-agent/tunnel-contract.ts — the two are a
// protocol pair and must change together.
export const NETWORK_AGENT_NAMESPACE = '/network-agent'

export const NetworkAgentEvent = {
    REGISTER: 'agent:register',
    REGISTERED: 'agent:registered',
    HEARTBEAT: 'agent:heartbeat',
    PROXY_REQUEST: 'agent:proxy-request',
    PROXY_RESPONSE: 'agent:proxy-response',
} as const

export type ProxyRequest = {
    requestId: string
    method: string
    url: string
    headers: Record<string, string>
    body?: unknown
    timeoutMs?: number
}

export type ProxyResponse = {
    requestId: string
    status?: number
    headers?: Record<string, string>
    body?: unknown
    error?: string
}
