import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { FEDERATION_LIMITS } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { networkUtils } from '../helper/network-utils'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { federationEventService } from './federation-event.service'

export const federationController: FastifyPluginAsyncZod = async (app) => {
    app.post('/events', EventsRequest, async (request): Promise<EventsResponse> => {
        const rawBody = request.rawBody
        if (typeof rawBody !== 'string') {
            throw new ApplicationError({ code: ErrorCode.AUTHENTICATION, params: { message: 'The federation event signature is invalid' } })
        }
        const signature = request.headers[FEDERATION_LIMITS.signatureHeader]
        const result = await federationEventService(request.log).receive({
            rawBody,
            signature: Array.isArray(signature) ? signature[0] : signature,
            ip: clientIp(request),
        })
        return { received: true, duplicate: result.duplicate }
    })
}

function clientIp(request: FastifyRequest): string | undefined {
    const ip = networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER))
    return isNil(ip) ? undefined : ip
}

const EventsResponse = z.object({
    received: z.boolean(),
    duplicate: z.boolean(),
})
type EventsResponse = z.infer<typeof EventsResponse>

const EventsRequest = {
    config: {
        rawBody: true,
        security: securityAccess.public(),
        rateLimit: {
            max: 1200,
            timeWindow: '1 minute',
        },
    },
    schema: {
        tags: ['federation'],
        body: z.unknown(),
        response: { [StatusCodes.OK]: EventsResponse },
    },
}
