import { z } from 'zod'

export const NETWORK_AGENT_NAMESPACE = '/network-agent'

export enum NetworkAgentEvent {
    REGISTER = 'agent:register',
    REGISTERED = 'agent:registered',
    HEARTBEAT = 'agent:heartbeat',
    PROXY_REQUEST = 'agent:proxy-request',
    PROXY_RESPONSE = 'agent:proxy-response',
}

export const ProxyRequest = z.object({
    requestId: z.string(),
    method: z.string(),
    url: z.string(),
    headers: z.record(z.string(), z.string()),
    body: z.unknown().optional(),
    timeoutMs: z.number().optional(),
})

export const ProxyResponse = z.object({
    requestId: z.string(),
    status: z.number().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
    error: z.string().optional(),
})

export const ProxyThroughAgentRequest = z.object({
    networkAgentId: z.string(),
    method: z.string(),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
})

export type ProxyRequest = z.infer<typeof ProxyRequest>
export type ProxyResponse = z.infer<typeof ProxyResponse>
export type ProxyThroughAgentRequest = z.infer<typeof ProxyThroughAgentRequest>
