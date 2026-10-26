import { RateLimitContext, RateLimitDeclaration } from '@fema-ipaas/connector-sdk'
import { blockedUntilMarker, generateId, isObject } from '@fema-ipaas/core-utils'
import { retryFetch } from '../api/retry-fetch'
import { ConnectorRuntime } from '../core/connector/connector-protocol'

export function createRateLimitContext({ runtime, declarations, stepName, reportEvents = true }: CreateParams): RateLimitContext {
    return {
        async acquire({ bucket, scopeKey }): Promise<void> {
            const declaration = declarations.find((limit) => limit.bucket === bucket)
            if (!declaration) {
                throw new Error(`Undeclared rate limit bucket: ${bucket}`)
            }
            const startedAt = Date.now()
            while (true) {
                const remainingMs = MAX_WAIT_MS - (Date.now() - startedAt)
                if (remainingMs <= 0) {
                    throw queueTimeout({ bucket, waitMs: 1000 })
                }
                const response = await retryFetch(`${runtime.internalApiUrl}v1/engine/rate-limits/acquire`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${runtime.engineToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bucket: `${runtime.connectorName}:${bucket}`,
                        scopeKey: declaration.scope === 'TENANT' ? 'tenant' : scopeKey,
                        perSecond: declaration.perSecond,
                        ...(reportEvents && !runtime.actionRunMode ? { event: {
                            executionId: runtime.executionId,
                            workflowId: runtime.workflowId,
                            stepName,
                            connectorName: runtime.connectorName,
                            eventKey: `${runtime.executionId}:${stepName}:rate-limit:${generateId()}`,
                        } } : {}),
                    }),
                    signal: AbortSignal.timeout(remainingMs),
                })
                if (!response.ok) {
                    throw new Error(`Rate limit acquisition failed: HTTP ${response.status}`)
                }
                const body: unknown = await response.json()
                if (!isObject(body) || typeof body['waitMs'] !== 'number' || !Number.isFinite(body['waitMs']) || body['waitMs'] < 0) {
                    throw new Error('Invalid rate limit response')
                }
                if (body['waitMs'] === 0) {
                    return
                }
                if (Date.now() - startedAt + body['waitMs'] >= MAX_WAIT_MS) {
                    throw queueTimeout({ bucket, waitMs: body['waitMs'] })
                }
                await rateLimitTiming.sleep(body['waitMs'])
            }
        },
    }
}

function queueTimeout({ bucket, waitMs }: { bucket: string, waitMs: number }): Error {
    return new Error(blockedUntilMarker.attach({
        message: `HTTP 429: Rate limit queue exceeded 60 seconds for ${bucket}`,
        until: new Date(Date.now() + waitMs),
    }))
}

const MAX_WAIT_MS = 60_000

export const rateLimitTiming = {
    sleep: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
}

type CreateParams = { runtime: ConnectorRuntime, declarations: RateLimitDeclaration[], stepName: string, reportEvents?: boolean }
