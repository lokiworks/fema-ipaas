import { ErrorCode, PlatformError } from '@fema/core-utils'
import { CloudOAuth2ConnectionValue } from '@fema/shared'
import { FastifyBaseLogger } from 'fastify'
import { OAuth2Service } from '../oauth2-service'

function notAvailable(): never {
    throw new PlatformError({
        code: ErrorCode.INVALID_CLOUD_CLAIM,
        params: {
            connectorName: 'unknown',
        },
    })
}

export const cloudOAuth2Service = (_log: FastifyBaseLogger): OAuth2Service<CloudOAuth2ConnectionValue> => ({
    refresh: async (): Promise<CloudOAuth2ConnectionValue> => notAvailable(),
    claim: async (): Promise<CloudOAuth2ConnectionValue> => notAvailable(),
})
