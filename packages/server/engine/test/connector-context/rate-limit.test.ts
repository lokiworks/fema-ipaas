import { afterEach, describe, expect, it, vi } from 'vitest'
import { blockedUntilMarker } from '@fema-ipaas/core-utils'
import { retryFetch } from '../../src/lib/api/retry-fetch'
import { createRateLimitContext, rateLimitTiming } from '../../src/lib/connector-context/rate-limit'

vi.mock('../../src/lib/api/retry-fetch', () => ({ retryFetch: vi.fn() }))

const runtime = {
    internalApiUrl: 'https://internal/', publicApiUrl: 'https://public/', engineToken: 'token', projectId: 'p',
    workflowId: 'w', workflowVersionId: 'v', executionId: 'e', connectorName: 'test', actionRunMode: false,
}

function context() {
    return createRateLimitContext({ runtime, stepName: 'step1', declarations: [{ bucket: 'read', scope: 'APP', perSecond: 50 }] })
}

afterEach(() => vi.restoreAllMocks())

describe('rate limit context', () => {
    it('waits and reacquires before letting a connector request proceed', async () => {
        vi.mocked(retryFetch).mockResolvedValueOnce(Response.json({ waitMs: 20 })).mockResolvedValueOnce(Response.json({ waitMs: 0 }))
        const sleep = vi.spyOn(rateLimitTiming, 'sleep').mockResolvedValue()
        await context().acquire({ bucket: 'read', scopeKey: 'app' })
        expect(sleep).toHaveBeenCalledWith(20)
        expect(retryFetch).toHaveBeenCalledTimes(2)
        const request = vi.mocked(retryFetch).mock.calls.at(-1)?.[1]
        expect(JSON.parse(String(request?.body))).toMatchObject({ bucket: 'test:read', scopeKey: 'app', perSecond: 50, event: { stepName: 'step1', workflowId: 'w' } })
    })

    it('rejects undeclared buckets before making any request', async () => {
        vi.mocked(retryFetch).mockClear()
        await expect(context().acquire({ bucket: 'unknown', scopeKey: 'app' })).rejects.toThrow('Undeclared')
        expect(retryFetch).not.toHaveBeenCalled()
    })

    it('returns a blocked-until failure when the wait budget is exhausted', async () => {
        vi.mocked(retryFetch).mockResolvedValueOnce(Response.json({ waitMs: 60_001 }))
        const result = await context().acquire({ bucket: 'read', scopeKey: 'app' }).catch((error: unknown) => error)
        expect(result).toBeInstanceOf(Error)
        expect(result instanceof Error ? blockedUntilMarker.parse(result.message) : null).toBeInstanceOf(Date)
    })
})
