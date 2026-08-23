import { EventEmitter } from 'node:events'
import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- mocks (must be before the import under test) ---

const { mockSystemGet, mockIsCanaryTenant } = vi.hoisted(() => ({
    mockSystemGet: vi.fn(),
    mockIsCanaryTenant: vi.fn(),
}))

vi.mock('../../../../../src/app/helper/system/system', () => ({
    system: {
        get: (...args: unknown[]) => mockSystemGet(...args),
    },
}))

vi.mock('../../../../../src/app/ee/tenant/tenant-plan/worker-group.service', () => ({
    workerGroupService: () => ({
        isCanaryTenant: mockIsCanaryTenant,
    }),
}))

const mockWorkflowExecutionCacheGet = vi.fn()

vi.mock('../../../../../src/app/workflows/workflow/workflow-execution-cache', () => ({
    workflowExecutionCache: () => ({
        get: (...args: unknown[]) => mockWorkflowExecutionCacheGet(...args),
    }),
}))

import { canaryRoutingMiddleware } from '../../../../../src/app/core/canary/canary-routing.middleware'
import { AppSystemProp } from '../../../../../src/app/helper/system/system-props'

// --- helpers ---

const mockLog: FastifyBaseLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: 'info',
} as unknown as FastifyBaseLogger


function makeRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
    return {
        headers: {},
        method: 'GET',
        url: '/v1/test',
        body: null,
        params: {},
        principal: undefined,
        log: mockLog,
        ...overrides,
    } as unknown as FastifyRequest
}

/**
 * Creates a mock reply whose `from()` simulates the async reply-from lifecycle:
 * - On success (default): emits 'finish' on reply.raw on the next microtask tick.
 * - On error: calls `onError` and then emits 'finish' on the next microtask tick.
 *
 * This is needed because `awaitProxy` wraps `reply.from()` in a Promise that
 * only resolves once reply.raw emits 'finish'.
 */
function makeReply(opts: { sent?: boolean, proxyError?: Error } = {}): FastifyReply {
    const { sent = false, proxyError } = opts
    const rawEmitter = new EventEmitter()

    const reply: Record<string, unknown> = {
        sent,
        raw: rawEmitter,
        status: vi.fn().mockReturnThis(),
        headers: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnValue(undefined),
    }

    reply.from = vi.fn().mockImplementation(
        (_url: string, fromOpts: { onError?: Function }) => {
            if (proxyError) {
                Promise.resolve().then(() => {
                    fromOpts?.onError?.(reply, { error: proxyError })
                    rawEmitter.emit('finish')
                })
            }
            else {
                Promise.resolve().then(() => rawEmitter.emit('finish'))
            }
            return reply
        },
    )

    return reply as unknown as FastifyReply
}

// --- tests ---

describe('canaryRoutingMiddleware', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsCanaryTenant.mockResolvedValue(false)
    })

    it('does nothing when CANARY_APP_URL is not set', async () => {
        mockSystemGet.mockReturnValue(undefined)
        const request = makeRequest()
        const reply = makeReply()

        await canaryRoutingMiddleware(request, reply)

        expect(reply.from).not.toHaveBeenCalled()
    })

    it('does nothing for WebSocket upgrade requests', async () => {
        mockSystemGet.mockReturnValue('http://canary:3000')
        const request = makeRequest({ headers: { upgrade: 'websocket' } })
        const reply = makeReply()

        await canaryRoutingMiddleware(request, reply)

        expect(reply.from).not.toHaveBeenCalled()
    })

    it('does nothing when tenant ID cannot be resolved', async () => {
        mockSystemGet.mockReturnValue('http://canary:3000')
        mockIsCanaryTenant.mockResolvedValue(true)
        const request = makeRequest({ params: {}, principal: undefined })
        const reply = makeReply()

        await canaryRoutingMiddleware(request, reply)

        expect(reply.from).not.toHaveBeenCalled()
    })

    it('does nothing when tenant is not in canary list', async () => {
        mockSystemGet.mockReturnValue('http://canary:3000')
        mockIsCanaryTenant.mockResolvedValue(false)
        const request = makeRequest({
            principal: { type: PrincipalType.USER, tenant: { id: 'tenant-abc' } } as never,
        })
        const reply = makeReply()

        await canaryRoutingMiddleware(request, reply)

        expect(reply.from).not.toHaveBeenCalled()
    })

    it('proxies request for a canary tenant resolved from principal', async () => {
        mockSystemGet.mockImplementation((prop: AppSystemProp) =>
            prop === AppSystemProp.CANARY_APP_URL ? 'http://canary:3000' : undefined,
        )
        mockIsCanaryTenant.mockResolvedValue(true)

        const request = makeRequest({
            method: 'GET',
            url: '/v1/workflows',
            principal: { type: PrincipalType.USER, tenant: { id: 'tenant-abc' } } as never,
        })
        const reply = makeReply()

        await canaryRoutingMiddleware(request, reply)

        expect(reply.from).toHaveBeenCalledWith(
            '/v1/workflows',
            expect.objectContaining({ onError: expect.any(Function) }),
        )
    })

    it('proxies request for a canary tenant resolved from workflowId cache', async () => {
        mockSystemGet.mockImplementation((prop: AppSystemProp) =>
            prop === AppSystemProp.CANARY_APP_URL ? 'http://canary:3000' : undefined,
        )
        mockIsCanaryTenant.mockResolvedValue(true)
        mockWorkflowExecutionCacheGet.mockResolvedValue({ exists: true, tenantId: 'tenant-xyz' })

        const request = makeRequest({
            method: 'POST',
            url: '/v1/webhooks/workflow-1',
            params: { workflowId: 'workflow-1' },
        })
        const reply = makeReply()

        await canaryRoutingMiddleware(request, reply)

        expect(reply.from).toHaveBeenCalledWith('/v1/webhooks/workflow-1', expect.anything())
    })
})
