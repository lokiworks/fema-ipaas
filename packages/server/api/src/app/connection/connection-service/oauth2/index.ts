import {
    ConnectionType,
    TenantOAuth2ConnectionValue,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import {
    ClaimOAuth2Request,
    OAuth2Service,
    RefreshOAuth2Request,
} from './oauth2-service'
import { cloudOAuth2Service } from './services/cloud-oauth2-service'
import { credentialsOauth2Service } from './services/credentials-oauth2-service'

const unimplementedService = (_log: FastifyBaseLogger): OAuth2Service<TenantOAuth2ConnectionValue> => ({
    claim: async (
        _req: ClaimOAuth2Request,
    ): Promise<TenantOAuth2ConnectionValue> => {
        throw new Error('Unimplemented tenant oauth')
    },
    refresh: async (
        _req: RefreshOAuth2Request<TenantOAuth2ConnectionValue>,
    ): Promise<TenantOAuth2ConnectionValue> => {
        throw new Error('Unimplemented tenant oauth')
    },
})

export const oauth2Handler = {
    [ConnectionType.CLOUD_OAUTH2]: cloudOAuth2Service,
    [ConnectionType.OAUTH2]: credentialsOauth2Service,
    [ConnectionType.TENANT_OAUTH2]: unimplementedService,
}

export function setTenantOAuthService(service: OAuth2Service<TenantOAuth2ConnectionValue>) {
    oauth2Handler[ConnectionType.TENANT_OAUTH2] = (_log: FastifyBaseLogger) => service
}
