import { createHash, randomBytes } from 'crypto'
import { OAuth2Props, PropertyType } from '@fema/connector-sdk'
import { assertNotNullOrUndefined, deleteProps, ErrorCode, isNil, PlatformError, PlatformId, unique } from '@fema/core-utils'
import { BaseOAuth2ConnectionValue, Connection, ConnectionType, GetOAuth2AuthorizationUrlResponse, OAuth2GrantType, resolveValueFromProps } from '@fema/shared'
import { isAxiosError } from 'axios'
import { FastifyBaseLogger } from 'fastify'
import { nanoid } from 'nanoid'
import { connectorMetadataService } from '../../../connectors/metadata/connector-metadata-service'

export const oauth2Util = (log: FastifyBaseLogger) => ({
    formatOAuth2Response: (response: Omit<BaseOAuth2ConnectionValue, 'claimed_at'>): BaseOAuth2ConnectionValue => {
        const secondsSinceEpoch = Math.round(Date.now() / 1000)
        const expiresIn = Number(response.expires_in)
        const formattedResponse: BaseOAuth2ConnectionValue = {
            ...response,
            expires_in: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : undefined,
            data: response,
            claimed_at: secondsSinceEpoch,
        }

        deleteProps(formattedResponse.data, [
            'access_token',
            'expires_in',
            'refresh_token',
            'scope',
            'token_type',
        ])
        return formattedResponse
    },
    isExpired: (connection: BaseOAuth2ConnectionValue): boolean => {
        const secondsSinceEpoch = Math.round(Date.now() / 1000)
        const grantType = connection.grant_type ?? OAuth2GrantType.AUTHORIZATION_CODE
        if (
            grantType === OAuth2GrantType.AUTHORIZATION_CODE &&
            !connection.refresh_token
        ) {
            return false
        }
        const parsedExpiresIn = Number(connection.expires_in)
        const expiresIn = Number.isFinite(parsedExpiresIn) && parsedExpiresIn > 0 ? parsedExpiresIn : 60 * 60
        const parsedClaimedAt = Number(connection.claimed_at)
        const claimedAt = Number.isFinite(parsedClaimedAt) && parsedClaimedAt > 0 ? parsedClaimedAt : 0
        const refreshThreshold = 15 * 60
        return (
            secondsSinceEpoch + refreshThreshold >= claimedAt + expiresIn
        )
    },
    isUserError: (e: unknown): boolean => {
        if (isAxiosError(e)) {
            const error = e.response?.data.error
            switch (error) {
                case 'invalid_grant':
                    return true
                case 'invalid_request':
                case 'invalid_client':
                case 'invalid_scope':
                case 'unauthorized_client':
                case 'unsupported_grant_type':
                default:
                    return false
            }
        }
        return false
    },
    getOAuth2TokenUrl: async ({
        platformId,
        connectorName,
        connectorVersion,
        props,
    }: OAuth2TokenUrlParams): Promise<string> => {
        const connectorMetadata = await connectorMetadataService(log).getOrThrow({
            name: connectorName,
            platformId,
            version: connectorVersion,
        })
        const connectorAuth = Array.isArray(connectorMetadata.auth) ? connectorMetadata.auth.find(auth => auth.type === PropertyType.OAUTH2) : connectorMetadata.auth
        assertNotNullOrUndefined(connectorAuth, 'auth')
        switch (connectorAuth.type) {
            case PropertyType.OAUTH2:
                assertPlaceholdersResolved({
                    templates: [connectorAuth.tokenUrl, ...connectorAuth.scope],
                    props,
                    authProps: connectorAuth.props,
                })
                return resolveValueFromProps(props, connectorAuth.tokenUrl)
            default:
                throw new PlatformError({
                    code: ErrorCode.INVALID_CONNECTION,
                    params: {
                        error: 'invalid auth type',
                    },
                })
        }
    },
    buildAuthorizationUrl: async ({
        platformId,
        connectorName,
        connectorVersion,
        clientId,
        redirectUrl,
        projectId: _projectId,
        props,
        scopes,
    }: BuildAuthorizationUrlParams): Promise<GetOAuth2AuthorizationUrlResponse> => {
        const connectorMetadata = await connectorMetadataService(log).getOrThrow({
            name: connectorName,
            platformId,
            version: connectorVersion,
        })
        const connectorAuth = Array.isArray(connectorMetadata.auth)
            ? connectorMetadata.auth.find(auth => auth.type === PropertyType.OAUTH2)
            : connectorMetadata.auth
        assertNotNullOrUndefined(connectorAuth, 'auth')
        if (connectorAuth.type !== PropertyType.OAUTH2) {
            throw new PlatformError({
                code: ErrorCode.INVALID_CONNECTION,
                params: { error: 'invalid auth type' },
            })
        }

        const resolvedClientId = clientId
        const selectedScopes = resolveSelectedScopes(scopes, connectorAuth.scope)
        assertPlaceholdersResolved({
            templates: [connectorAuth.authUrl, ...selectedScopes],
            props,
            authProps: connectorAuth.props,
        })
        const authUrl = resolveValueFromProps(props, connectorAuth.authUrl)
        const scope = resolveValueFromProps(props, selectedScopes.join(' '))

        const queryParams: Record<string, string> = {
            response_type: 'code',
            client_id: resolvedClientId,
            redirect_uri: redirectUrl,
            access_type: 'offline',
            state: nanoid(),
            prompt: 'consent',
            scope,
            ...(connectorAuth.extra ?? {}),
        }

        const prompt = connectorAuth.prompt
        if (prompt === 'omit') {
            delete queryParams['prompt']
        }
        else if (prompt !== undefined && prompt !== null) {
            queryParams['prompt'] = prompt
        }

        let codeVerifier: string | undefined
        if (connectorAuth.pkce) {
            codeVerifier = randomBytes(32).toString('base64url').slice(0, 43)
            const method = connectorAuth.pkceMethod ?? 'plain'
            queryParams['code_challenge_method'] = method
            if (method === 'S256') {
                const hash = createHash('sha256').update(codeVerifier).digest()
                queryParams['code_challenge'] = Buffer.from(hash).toString('base64url')
            }
            else {
                queryParams['code_challenge'] = codeVerifier
            }
        }

        const url = new URL(authUrl)
        Object.entries(queryParams).forEach(([key, value]) => {
            if (value !== '') {
                url.searchParams.append(key, value)
            }
        })

        return {
            authorizationUrl: url.toString(),
            codeVerifier,
        }
    },
    removeRefreshTokenAndClientSecret: (connection: Connection): Connection => {
        if (connection.value.type === ConnectionType.OAUTH2 && connection.value.grant_type === OAuth2GrantType.CLIENT_CREDENTIALS) {
            connection.value.client_secret = '(REDACTED)'
        }
        if (connection.value.type === ConnectionType.OAUTH2
            || connection.value.type === ConnectionType.CLOUD_OAUTH2
            || connection.value.type === ConnectionType.PLATFORM_OAUTH2) {
            connection.value = {
                ...connection.value,
                refresh_token: '(REDACTED)',
            }
        }
        return connection
    },
})

type OAuth2TokenUrlParams = {
    platformId: PlatformId
    connectorName: string
    connectorVersion?: string
    props?: Record<string, unknown>
}

const resolveSelectedScopes = (requested: string[] | undefined, allowed: string[]): string[] => {
    if (requested === undefined) {
        return allowed
    }
    const allowedSet = new Set(allowed)
    const invalid = requested.filter(scope => !allowedSet.has(scope))
    if (invalid.length > 0) {
        throw new PlatformError({
            code: ErrorCode.INVALID_CONNECTION,
            params: { error: `requested scopes are not declared by the connector: ${invalid.join(', ')}` },
        })
    }
    if (requested.length === 0) {
        throw new PlatformError({
            code: ErrorCode.INVALID_CONNECTION,
            params: { error: 'at least one scope must be selected' },
        })
    }
    return requested
}

const assertPlaceholdersResolved = ({ templates, props, authProps }: AssertPlaceholdersResolvedParams): void => {
    const declaredProps = authProps ?? {}
    const missing = unique(
        templates
            .flatMap(template => [...template.matchAll(/\{([A-Za-z0-9_]+)\}/g)])
            .map(match => match[1])
            .filter(key => !isNil(declaredProps[key]))
            .filter(key => {
                const value = props?.[key]
                return isNil(value) || String(value).trim() === ''
            }),
    )
    if (missing.length === 0) {
        return
    }
    const labels = missing.map(key => declaredProps[key].displayName).join(', ')
    throw new PlatformError({
        code: ErrorCode.INVALID_CONNECTION,
        params: { error: `missing required connection settings: ${labels}` },
    })
}

type AssertPlaceholdersResolvedParams = {
    templates: string[]
    props: Record<string, unknown> | undefined
    authProps: OAuth2Props | undefined
}

type BuildAuthorizationUrlParams = {
    platformId: PlatformId
    connectorName: string
    connectorVersion?: string
    clientId: string
    redirectUrl: string
    props?: Record<string, unknown>
    projectId?: string
    scopes?: string[]
}
