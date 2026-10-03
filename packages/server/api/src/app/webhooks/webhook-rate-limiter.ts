import { isNil } from '@fema-ipaas/core-utils'
import { wideEvent } from '@fema-ipaas/server-utils'
import { WebhookUrlParams } from '@fema-ipaas/shared'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

function resolveMaxRequests(): number {
    const max = system.getNumber(AppSystemProp.WEBHOOK_RATE_LIMIT_MAX)
    if (isNil(max)) {
        return DEFAULT_MAX_REQUESTS
    }
    return Math.max(0, max)
}

function resolveWindowMs(): number {
    const seconds = system.getNumber(AppSystemProp.WEBHOOK_RATE_LIMIT_WINDOW_SECONDS)
    if (isNil(seconds) || seconds <= 0) {
        return DEFAULT_WINDOW_SECONDS * 1000
    }
    return seconds * 1000
}

function extractWorkflowId(request: FastifyRequest): string | undefined {
    const parsed = WebhookUrlParams.safeParse(request.params)
    return parsed.success ? parsed.data.workflowId : undefined
}

function register({ app }: RegisterParams): void {
    const checkRateLimit = app.createRateLimit({
        max: resolveMaxRequests,
        timeWindow: resolveWindowMs,
        keyGenerator: (request) => `${RATE_LIMIT_KEY_PREFIX}${extractWorkflowId(request) ?? ''}`,
        allowList: () => resolveMaxRequests() === 0,
        skipOnError: true,
    })

    app.addHook('onRequest', async (request, reply) => {
        const workflowId = extractWorkflowId(request)
        if (isNil(workflowId)) {
            return
        }
        const result = await checkRateLimit(request)
        if (result.isAllowed || !result.isExceeded) {
            return
        }
        const retryAfterSeconds = Math.max(1, result.ttlInSeconds)
        wideEvent.set({
            workflow: { id: workflowId },
            webhook: {
                rateLimited: true,
                rateLimitMax: result.max,
                retryAfterMs: result.ttl,
                responseStatus: StatusCodes.TOO_MANY_REQUESTS,
            },
        })
        return reply
            .status(StatusCodes.TOO_MANY_REQUESTS)
            .headers({
                'retry-after': String(retryAfterSeconds),
                'x-ratelimit-limit': String(result.max),
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(retryAfterSeconds),
            })
            .send({
                statusCode: StatusCodes.TOO_MANY_REQUESTS,
                error: 'Too Many Requests',
                message: `Webhook rate limit exceeded for this workflow, retry in ${retryAfterSeconds} seconds`,
            })
    })
}

const DEFAULT_MAX_REQUESTS = 600
const DEFAULT_WINDOW_SECONDS = 60
const RATE_LIMIT_KEY_PREFIX = 'webhook-workflow:v1:'

export const webhookRateLimiter = {
    register,
}

type RegisterParams = {
    app: FastifyInstance
}
