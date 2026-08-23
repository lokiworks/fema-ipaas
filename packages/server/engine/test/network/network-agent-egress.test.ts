import { vi } from 'vitest'
import { networkAgentEgress } from '../../src/lib/network/network-agent-egress'

const API_URL = 'https://platform.example.com/api/'

describe('networkAgentEgress', () => {
    let calls: { url: string, init?: RequestInit }[]
    let originalFetch: typeof globalThis.fetch

    beforeEach(() => {
        calls = []
        originalFetch = globalThis.fetch
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(input), init })
            return new Response(JSON.stringify({ requestId: 'r1', status: 201, headers: {}, body: { ok: true } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        }) as typeof globalThis.fetch
    })

    afterEach(() => {
        networkAgentEgress.deactivate()
        globalThis.fetch = originalFetch
    })

    function activate() {
        networkAgentEgress.activate({ networkAgentId: 'agent-1', apiUrl: API_URL, engineToken: 'token' })
    }

    it('is inactive until a bound connection activates it', () => {
        expect(networkAgentEgress.isActive()).toBe(false)
        activate()
        expect(networkAgentEgress.isActive()).toBe(true)
    })

    it('sends outbound traffic to the proxy endpoint instead of the target', async () => {
        activate()
        await fetch('https://sap.internal/api/orders', { method: 'GET' })

        expect(calls).toHaveLength(1)
        expect(calls[0].url).toBe(`${API_URL}v1/network-agents/proxy`)
        const sent = JSON.parse(String(calls[0].init?.body))
        expect(sent.networkAgentId).toBe('agent-1')
        expect(sent.url).toBe('https://sap.internal/api/orders')
        expect(sent.method).toBe('GET')
    })

    it('lets calls to the platform itself through untouched', async () => {
        activate()
        await fetch(`${API_URL}v1/worker/connections/x`)

        expect(calls[0].url).toBe(`${API_URL}v1/worker/connections/x`)
    })

    it('returns the proxied status and body to the caller', async () => {
        activate()
        const response = await fetch('https://sap.internal/api/orders')

        expect(response.status).toBe(201)
        await expect(response.json()).resolves.toEqual({ ok: true })
    })

    it('surfaces an agent-side failure as an error naming the target', async () => {
        globalThis.fetch = vi.fn(async () => new Response(
            JSON.stringify({ requestId: 'r1', error: 'connect ECONNREFUSED' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as typeof globalThis.fetch
        activate()

        await expect(fetch('https://sap.internal/api/orders'))
            .rejects.toThrow(/could not reach https:\/\/sap.internal\/api\/orders/)
    })

    it('surfaces a refused proxy request rather than silently returning nothing', async () => {
        globalThis.fetch = vi.fn(async () => new Response('nope', { status: 403 })) as typeof globalThis.fetch
        activate()

        await expect(fetch('https://sap.internal/api/orders')).rejects.toThrow(/refused the request/)
    })

    it('stops routing once deactivated', async () => {
        activate()
        networkAgentEgress.deactivate()
        await fetch('https://sap.internal/api/orders')

        expect(calls[0].url).toBe('https://sap.internal/api/orders')
    })

    it('does not attach a body to a status that must not have one', async () => {
        globalThis.fetch = vi.fn(async () => new Response(
            JSON.stringify({ requestId: 'r1', status: 204, headers: {}, body: { ignored: true } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as typeof globalThis.fetch
        activate()

        const response = await fetch('https://sap.internal/api/orders')
        expect(response.status).toBe(204)
        await expect(response.text()).resolves.toBe('')
    })
})
