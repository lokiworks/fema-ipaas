import { ApId, BaseModel, BaseModelSchema, Metadata, Nullable } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { UserWithMetaInformation } from '../../core/user'
import { OAuth2GrantType } from './dto/upsert-connection-request'
import { OAuth2AuthorizationMethod } from './oauth2-authorization-method'

export type ConnectionId = string

export enum ConnectionStatus {
    ACTIVE = 'ACTIVE',
    MISSING = 'MISSING',
    ERROR = 'ERROR',
}

export enum ConnectionScope {
    WORKSPACE = 'WORKSPACE',
    TENANT = 'TENANT',
}

export enum ConnectionType {
    OAUTH2 = 'OAUTH2',
    TENANT_OAUTH2 = 'TENANT_OAUTH2',
    CLOUD_OAUTH2 = 'CLOUD_OAUTH2',
    SECRET_TEXT = 'SECRET_TEXT',
    BASIC_AUTH = 'BASIC_AUTH',
    CUSTOM_AUTH = 'CUSTOM_AUTH',
    OIDC = 'OIDC',
    NO_AUTH = 'NO_AUTH',
}

export type SecretTextConnectionValue = {
    type: ConnectionType.SECRET_TEXT
    secret_text: string
}
export type BasicAuthConnectionValue = {
    username: string
    password: string
    type: ConnectionType.BASIC_AUTH
}

export type BaseOAuth2ConnectionValue = {
    expires_in?: number
    client_id: string
    token_type: string
    access_token: string
    claimed_at: number
    refresh_token: string
    scope: string
    token_url: string
    authorization_method?: OAuth2AuthorizationMethod
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: Record<string, any>
    props?: Record<string, unknown>
    grant_type?: OAuth2GrantType
}

export type CustomAuthConnectionValue<T extends Record<string, unknown> = Record<string, unknown>> = {
    type: ConnectionType.CUSTOM_AUTH
    props: T
    access_token?: string
    token_refresh_at?: number
}

export type OIDCConnectionValue<T extends Record<string, unknown> = Record<string, unknown>> = {
    type: ConnectionType.OIDC
    props: T
}

export type CloudOAuth2ConnectionValue = {
    type: ConnectionType.CLOUD_OAUTH2
} & BaseOAuth2ConnectionValue

export type TenantOAuth2ConnectionValue = {
    type: ConnectionType.TENANT_OAUTH2
    redirect_url: string
} & BaseOAuth2ConnectionValue

export type OAuth2ConnectionValueWithApp = {
    type: ConnectionType.OAUTH2
    client_secret: string
    redirect_url: string
} & BaseOAuth2ConnectionValue

export type NoAuthConnectionValue = {
    type: ConnectionType.NO_AUTH
}

export type ConnectionValue<T extends ConnectionType = ConnectionType, PropsType extends Record<string, unknown> = Record<string, unknown>> =
    T extends ConnectionType.SECRET_TEXT ? SecretTextConnectionValue :
        T extends ConnectionType.BASIC_AUTH ? BasicAuthConnectionValue :
            T extends ConnectionType.CLOUD_OAUTH2 ? CloudOAuth2ConnectionValue :
                T extends ConnectionType.TENANT_OAUTH2 ? TenantOAuth2ConnectionValue :
                    T extends ConnectionType.OAUTH2 ? OAuth2ConnectionValueWithApp :
                        T extends ConnectionType.CUSTOM_AUTH ? CustomAuthConnectionValue<PropsType> :
                            T extends ConnectionType.OIDC ? OIDCConnectionValue<PropsType> :
                                T extends ConnectionType.NO_AUTH ? NoAuthConnectionValue :
                                    never

export type Connection<Type extends ConnectionType = ConnectionType> = BaseModel<ConnectionId> & {
    externalId: string
    type: Type
    scope: ConnectionScope
    connectorName: string
    displayName: string
    workspaceIds: string[]
    tenantId: string
    status: ConnectionStatus
    ownerId: string
    owner: UserWithMetaInformation | null
    value: ConnectionValue<Type>
    metadata: Metadata | null
    connectorVersion: string
    preSelectForNewWorkspaces: boolean
}

export type OAuth2Connection = Connection<ConnectionType.OAUTH2>
export type SecretKeyConnection = Connection<ConnectionType.SECRET_TEXT>
export type CloudAuth2Connection = Connection<ConnectionType.CLOUD_OAUTH2>
export type TenantOAuth2Connection = Connection<ConnectionType.TENANT_OAUTH2>
export type BasicAuthConnection = Connection<ConnectionType.BASIC_AUTH>
export type CustomAuthConnection = Connection<ConnectionType.CUSTOM_AUTH>
export type OIDCConnection = Connection<ConnectionType.OIDC>
export type NoAuthConnection = Connection<ConnectionType.NO_AUTH>

export const ConnectionWithoutSensitiveData = z.object({
    ...BaseModelSchema,
    externalId: z.string(),
    displayName: z.string(),
    type: z.nativeEnum(ConnectionType),
    connectorName: z.string(),
    workspaceIds: z.array(ApId),
    tenantId: Nullable(z.string()),
    scope: z.nativeEnum(ConnectionScope),
    status: z.nativeEnum(ConnectionStatus),
    ownerId: Nullable(z.string()),
    owner: Nullable(UserWithMetaInformation),
    metadata: Nullable(Metadata),
    workflowIds: Nullable(z.array(ApId)),
    connectorVersion: z.string(),
    preSelectForNewWorkspaces: z.boolean(),
}).describe('App connection is a connection to an external app.')
export type ConnectionWithoutSensitiveData = z.infer<typeof ConnectionWithoutSensitiveData>

export const ConnectionOwners = z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
})

export type ConnectionOwners = z.infer<typeof ConnectionOwners>
export const resolveValueFromProps = (props: Record<string, unknown> | undefined, value: string)=>{
    let resolvedScope = value
    if (!props) {
        return resolvedScope
    }
    Object.entries(props).forEach(([key, value]) => {
        resolvedScope = resolvedScope.replaceAll(`{${key}}`, () => String(value))
    })
    return resolvedScope
}
