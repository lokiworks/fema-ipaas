import { safeHttp } from '@fema-ipaas/server-utils'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { oidcClient, OidcDiscovery } from '../../../../src/app/sso/oidc-client'

const discovery: OidcDiscovery = {
    issuer: 'https://iam.test',
    authorizationEndpoint: 'https://iam.test/oauth2/authorize',
    tokenEndpoint: 'https://iam.test/oauth2/token',
    jwksUri: 'https://iam.test/jwks',
    userinfoEndpoint: null,
    tokenAuthMethods: ['client_secret_basic'],
    scopesSupported: ['openid', 'offline_access'],
}

function httpError(status: number, data: unknown): AxiosError {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, { status, statusText: '', data, headers: {}, config: { headers: new AxiosHeaders() } })
}

describe('oidc client for federated identity providers', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('adds the extra authorization parameters to the redirect', () => {
        const url = new URL(oidcClient.buildAuthorizationUrl({
            discovery,
            clientId: 'client',
            redirectUri: 'https://ipaas.test/callback',
            scopes: 'openid email',
            state: 's',
            nonce: 'n',
            codeVerifier: 'v',
            extraParams: { tenant: 'acme', prompt: 'login' },
        }))
        expect(url.searchParams.get('tenant')).toBe('acme')
        expect(url.searchParams.get('prompt')).toBe('login')
        expect(url.searchParams.get('client_id')).toBe('client')
    })

    it('never lets an extra parameter replace a protocol parameter', () => {
        const url = new URL(oidcClient.buildAuthorizationUrl({
            discovery,
            clientId: 'client',
            redirectUri: 'https://ipaas.test/callback',
            scopes: 'openid',
            state: 'real-state',
            nonce: 'n',
            codeVerifier: 'v',
            extraParams: { state: 'forged', redirect_uri: 'https://evil.test', client_id: 'other', scope: 'admin', code_challenge: 'x' },
        }))
        expect(url.searchParams.get('state')).toBe('real-state')
        expect(url.searchParams.get('redirect_uri')).toBe('https://ipaas.test/callback')
        expect(url.searchParams.get('client_id')).toBe('client')
        expect(url.searchParams.get('scope')).toBe('openid')
        expect(url.searchParams.getAll('code_challenge')).toHaveLength(1)
    })

    it('reports a refreshed token and a rotated refresh token', async () => {
        vi.spyOn(safeHttp.axios, 'post').mockResolvedValue({ data: { access_token: 'a', refresh_token: 'rotated' } })
        const outcome = await oidcClient.refresh({ discovery, clientId: 'c', clientSecret: 's', refreshToken: 'old' })
        expect(outcome).toEqual({ outcome: 'ok', refreshToken: 'rotated' })
    })

    it('treats invalid_grant as a rejection of the member', async () => {
        vi.spyOn(safeHttp.axios, 'post').mockRejectedValue(httpError(400, { error: 'invalid_grant' }))
        const outcome = await oidcClient.refresh({ discovery, clientId: 'c', clientSecret: 's', refreshToken: 'old' })
        expect(outcome).toEqual({ outcome: 'rejected' })
    })

    it('does not treat a server error or a client problem as a removal', async () => {
        const post = vi.spyOn(safeHttp.axios, 'post')
        post.mockRejectedValueOnce(httpError(503, 'unavailable'))
        expect((await oidcClient.refresh({ discovery, clientId: 'c', clientSecret: 's', refreshToken: 'old' })).outcome).toBe('unavailable')
        post.mockRejectedValueOnce(httpError(401, { error: 'invalid_client' }))
        expect((await oidcClient.refresh({ discovery, clientId: 'c', clientSecret: 's', refreshToken: 'old' })).outcome).toBe('unavailable')
    })

    it('does not treat a network failure as a removal', async () => {
        vi.spyOn(safeHttp.axios, 'post').mockRejectedValue(new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED'))
        const outcome = await oidcClient.refresh({ discovery, clientId: 'c', clientSecret: 's', refreshToken: 'old' })
        expect(outcome.outcome).toBe('unavailable')
    })

    it('sends the refresh token with the refresh_token grant', async () => {
        const post = vi.spyOn(safeHttp.axios, 'post').mockResolvedValue({ data: {} })
        await oidcClient.refresh({ discovery, clientId: 'c', clientSecret: 's', refreshToken: 'old' })
        const [url, body] = post.mock.calls[0]
        expect(url).toBe(discovery.tokenEndpoint)
        const form = new URLSearchParams(String(body))
        expect(form.get('grant_type')).toBe('refresh_token')
        expect(form.get('refresh_token')).toBe('old')
    })
})
