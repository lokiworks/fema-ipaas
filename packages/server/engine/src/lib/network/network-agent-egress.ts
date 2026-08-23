import { isNil } from '@fema-ipaas/core-utils'
import { ProxyResponse } from '@fema-ipaas/shared'

let activeAgent: ActiveAgent | null = null
let originalFetch: typeof globalThis.fetch | null = null

export const networkAgentEgress = {
    // A connector runs in a fresh child process per call (ADR 0029), so "the agent for this
    // process" is unambiguous: it is the agent bound to the connection this call resolved.
    activate(agent: ActiveAgent): void {
        activeAgent = agent
        if (!isNil(originalFetch)) {
            return
        }
        originalFetch = globalThis.fetch
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (isNil(activeAgent) || isInternalApiCall(input, activeAgent.apiUrl)) {
                return originalFetch!(input, init)
            }
            return proxyThroughAgent({ agent: activeAgent, input, init, fallback: originalFetch! })
        }) as typeof globalThis.fetch
    },

    // Fully undoes activate(): the wrapper is removed and the original fetch restored, so a
    // deactivated egress leaves no trace on the process it ran in.
    deactivate(): void {
        activeAgent = null
        if (!isNil(originalFetch)) {
            globalThis.fetch = originalFetch
            originalFetch = null
        }
    },

    isActive(): boolean {
        return !isNil(activeAgent)
    },
}

async function proxyThroughAgent({ agent, input, init, fallback }: ProxyParams): Promise<Response> {
    const url = urlOf(input)
    const response = await fallback(`${agent.apiUrl}v1/network-agents/proxy`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${agent.engineToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            networkAgentId: agent.networkAgentId,
            method: init?.method ?? 'GET',
            url,
            headers: headersOf(init),
            body: bodyOf(init),
        }),
    })
    if (!response.ok) {
        throw new Error(`Network agent proxy refused the request for ${url}: ${response.status}`)
    }
    const proxied: ProxyResponse = await response.json()
    if (!isNil(proxied.error)) {
        throw new Error(`Network agent could not reach ${url}: ${proxied.error}`)
    }
    const status = proxied.status ?? 200
    // 204/205/304 must not carry a body; the Response constructor throws if one is attached.
    const body = NULL_BODY_STATUSES.has(status) ? null : serializeBody(proxied.body)
    return new Response(body, {
        status,
        headers: proxied.headers ?? {},
    })
}

function isInternalApiCall(input: RequestInfo | URL, apiUrl: string): boolean {
    return urlOf(input).startsWith(apiUrl)
}

function urlOf(input: RequestInfo | URL): string {
    if (typeof input === 'string') {
        return input
    }
    if (input instanceof URL) {
        return input.toString()
    }
    return input.url
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
    if (isNil(init?.headers)) {
        return {}
    }
    const collected: Record<string, string> = {}
    new Headers(init.headers).forEach((value, key) => {
        collected[key] = value
    })
    return collected
}

function bodyOf(init: RequestInit | undefined): unknown {
    if (typeof init?.body !== 'string') {
        return undefined
    }
    try {
        return JSON.parse(init.body)
    }
    catch {
        return init.body
    }
}

function serializeBody(body: unknown): string {
    if (isNil(body)) {
        return ''
    }
    return typeof body === 'string' ? body : JSON.stringify(body)
}

const NULL_BODY_STATUSES = new Set([204, 205, 304])

type ActiveAgent = {
    networkAgentId: string
    apiUrl: string
    engineToken: string
}

type ProxyParams = {
    agent: ActiveAgent
    input: RequestInfo | URL
    init: RequestInit | undefined
    fallback: typeof globalThis.fetch
}
