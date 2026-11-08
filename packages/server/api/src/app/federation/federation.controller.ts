import { isNil } from '@fema-ipaas/core-utils'
import { FEDERATION_LIMITS } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { networkUtils } from '../helper/network-utils'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { memberEventService } from './member-event.service'

export const federationController: FastifyPluginAsyncZod = async (app) => {
    app.post('/members/:tenantId', MemberEventsRequest, async (request): Promise<MemberEventsResponse> => {
        const rawBody = request.rawBody
        if (typeof rawBody !== 'string') {
            return { received: false }
        }
        const signature = request.headers[FEDERATION_LIMITS.signatureHeader]
        const result = await memberEventService(request.log).receive({
            tenantId: request.params.tenantId,
            rawBody,
            signature: Array.isArray(signature) ? signature[0] : signature,
            ip: clientIp(request),
        })
        return result.outcome === 'verification' && !isNil(result.challenge)
            ? { received: true, challenge: result.challenge }
            : { received: result.outcome !== 'ignored' }
    })
}

function clientIp(request: FastifyRequest): string | undefined {
    const ip = networkUtils.extractClientRealIp(request, system.get(AppSystemProp.CLIENT_REAL_IP_HEADER))
    return isNil(ip) ? undefined : ip
}

const MemberEventsResponse = z.object({
    received: z.boolean(),
    challenge: z.string().optional(),
})
type MemberEventsResponse = z.infer<typeof MemberEventsResponse>

const MemberEventsRequest = {
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
        params: z.object({ tenantId: z.string().min(1).max(21) }),
        body: z.unknown(),
        response: { [StatusCodes.OK]: MemberEventsResponse },
    },
}
