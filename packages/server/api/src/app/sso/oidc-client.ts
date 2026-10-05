import { createHash, createPublicKey, KeyObject, randomBytes } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import { SsoLoginErrorCode } from '@fema-ipaas/shared'
import { isAxiosError } from 'axios'
import jwt, { Algorithm } from 'jsonwebtoken'
import { z } from 'zod'
import { SsoLoginError } from './sso-errors'

async function discover({ issuer }: DiscoverParams): Promise<OidcDiscovery> {
    const cached = discoveryCache.get(issuer)
    if (!isNil(cached) && cached.expiresAt > Date.now()) {
        return cached.discovery
    }
    const url = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`
    const body = await getJson({ url, what: 'discovery document' })
    const parsed = DiscoveryDocument.safeParse(body)
    if (!parsed.success) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_UNREACHABLE, detail: 'The discovery document is missing required fields' })
    }
    if (parsed.data.issuer !== issuer) {
        throw new SsoLoginError({
            code: SsoLoginErrorCode.ISSUER_MISMATCH,
            detail: `The identity provider reports issuer ${parsed.data.issuer} but ${issuer} is configured`,
        })
    }
    const discovery: OidcDiscovery = {
        issuer: parsed.data.issuer,
        authorizationEndpoint: parsed.data.authorization_endpoint,
        tokenEndpoint: parsed.data.token_endpoint,
        jwksUri: parsed.data.jwks_uri,
        userinfoEndpoint: parsed.data.userinfo_endpoint ?? null,
        tokenAuthMethods: parsed.data.token_endpoint_auth_methods_supported ?? ['client_secret_basic'],
    }
    discoveryCache.set(issuer, { discovery, expiresAt: Date.now() + CACHE_TTL_MS })
    return discovery
}

function buildAuthorizationUrl({ discovery, clientId, redirectUri, scopes, state, nonce, codeVerifier }: BuildAuthorizationUrlParams): string {
    const url = new URL(discovery.authorizationEndpoint)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scopes)
    url.searchParams.set('state', state)
    url.searchParams.set('nonce', nonce)
    url.searchParams.set('code_challenge', challengeFor(codeVerifier))
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
}

async function exchangeCode({ discovery, clientId, clientSecret, code, redirectUri, codeVerifier }: ExchangeCodeParams): Promise<OidcTokens> {
    const useBasic = discovery.tokenAuthMethods.includes('client_secret_basic') || !discovery.tokenAuthMethods.includes('client_secret_post')
    const form = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        ...(useBasic ? {} : { client_id: clientId, client_secret: clientSecret }),
    })
    const headers: Record<string, string> = {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        ...(useBasic ? { authorization: `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')}` } : {}),
    }
    try {
        const response = await safeHttp.axios.post<unknown>(discovery.tokenEndpoint, form.toString(), { headers, timeout: HTTP_TIMEOUT_MS, maxRedirects: 0 })
        const parsed = TokenResponse.safeParse(response.data)
        if (!parsed.success) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'The token endpoint returned no id_token' })
        }
        return { idToken: parsed.data.id_token, accessToken: parsed.data.access_token ?? null }
    }
    catch (error) {
        throw mapTokenEndpointError(error)
    }
}

async function verifyIdToken({ idToken, discovery, clientId, nonce }: VerifyIdTokenParams): Promise<Record<string, unknown>> {
    const decoded = jwt.decode(idToken, { complete: true })
    if (isNil(decoded) || typeof decoded.payload === 'string') {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'The id_token is not a valid JWT' })
    }
    const algorithm = ASYMMETRIC_ALGORITHMS.find((candidate) => candidate === decoded.header.alg)
    if (isNil(algorithm)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: `The id_token algorithm ${decoded.header.alg} is not accepted` })
    }
    const key = await findSigningKey({ discovery, keyId: decoded.header.kid ?? null, algorithm })
    const payload = verifySignedPayload({ idToken, key, algorithm, issuer: discovery.issuer, clientId })
    assertNonceAndAuthorizedParty({ payload, nonce, clientId })
    return payload
}

async function fetchUserinfo({ discovery, accessToken, subject }: FetchUserinfoParams): Promise<Record<string, unknown>> {
    if (isNil(discovery.userinfoEndpoint) || isNil(accessToken)) {
        return {}
    }
    try {
        const response = await safeHttp.axios.get<unknown>(discovery.userinfoEndpoint, {
            headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
            timeout: HTTP_TIMEOUT_MS,
            maxRedirects: 0,
        })
        if (!isRecord(response.data) || response.data['sub'] !== subject) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'The userinfo subject does not match the id_token subject' })
        }
        return response.data
    }
    catch (error) {
        if (error instanceof SsoLoginError) {
            throw error
        }
        return {}
    }
}

function randomToken(): string {
    return randomBytes(32).toString('base64url')
}

function challengeFor(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url')
}

function clearCache(): void {
    discoveryCache.clear()
    jwksCache.clear()
}

async function getJson({ url, what }: GetJsonParams): Promise<unknown> {
    try {
        const response = await safeHttp.axios.get<unknown>(url, { headers: { accept: 'application/json' }, timeout: HTTP_TIMEOUT_MS, maxRedirects: 3 })
        return response.data
    }
    catch (error) {
        const reason = isAxiosError(error) ? (error.response ? `HTTP ${error.response.status}` : error.message) : 'unknown error'
        throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_UNREACHABLE, detail: `Could not load the ${what} from ${url}: ${reason}` })
    }
}

async function findSigningKey({ discovery, keyId, algorithm }: FindSigningKeyParams): Promise<KeyObject> {
    const first = await loadJwks({ jwksUri: discovery.jwksUri, forceRefresh: false })
    const firstMatch = pickKey({ keys: first, keyId, algorithm })
    if (!isNil(firstMatch)) {
        return toKeyObject(firstMatch)
    }
    const second = await loadJwks({ jwksUri: discovery.jwksUri, forceRefresh: true })
    const secondMatch = pickKey({ keys: second, keyId, algorithm })
    if (isNil(secondMatch)) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'No signing key of the identity provider matches the id_token' })
    }
    return toKeyObject(secondMatch)
}

async function loadJwks({ jwksUri, forceRefresh }: LoadJwksParams): Promise<Jwk[]> {
    const cached = jwksCache.get(jwksUri)
    if (!forceRefresh && !isNil(cached) && cached.expiresAt > Date.now()) {
        return cached.keys
    }
    const body = await getJson({ url: jwksUri, what: 'signing keys' })
    const parsed = JwksDocument.safeParse(body)
    if (!parsed.success) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_UNREACHABLE, detail: 'The signing key document is malformed' })
    }
    jwksCache.set(jwksUri, { keys: parsed.data.keys, expiresAt: Date.now() + CACHE_TTL_MS })
    return parsed.data.keys
}

function pickKey({ keys, keyId, algorithm }: PickKeyParams): Jwk | undefined {
    const usable = keys.filter((key) => (isNil(key.use) || key.use === 'sig') && (isNil(key.alg) || key.alg === algorithm))
    if (isNil(keyId)) {
        return usable.length === 1 ? usable[0] : undefined
    }
    return usable.find((key) => key.kid === keyId)
}

function toKeyObject(jwk: Jwk): KeyObject {
    try {
        return createPublicKey({ key: jwk, format: 'jwk' })
    }
    catch {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'A signing key of the identity provider cannot be used' })
    }
}

function verifySignedPayload({ idToken, key, algorithm, issuer, clientId }: VerifySignedPayloadParams): Record<string, unknown> {
    try {
        const verified = jwt.verify(idToken, key, { algorithms: [algorithm], issuer, audience: clientId, clockTolerance: CLOCK_TOLERANCE_SECONDS })
        if (!isRecord(verified)) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'The id_token payload is not an object' })
        }
        return verified
    }
    catch (error) {
        if (error instanceof SsoLoginError) {
            throw error
        }
        const message = error instanceof Error ? error.message : 'invalid token'
        if (message.includes('issuer')) {
            throw new SsoLoginError({ code: SsoLoginErrorCode.ISSUER_MISMATCH, detail: `The id_token issuer does not match the configured issuer ${issuer}` })
        }
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: `The id_token was rejected: ${message}` })
    }
}

function assertNonceAndAuthorizedParty({ payload, nonce, clientId }: AssertNonceParams): void {
    if (payload['nonce'] !== nonce) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'The id_token nonce does not match this sign-in request' })
    }
    const audience = payload['aud']
    if (Array.isArray(audience) && audience.length > 1 && payload['azp'] !== clientId) {
        throw new SsoLoginError({ code: SsoLoginErrorCode.TOKEN_INVALID, detail: 'The id_token authorized party does not match the client' })
    }
}

function mapTokenEndpointError(error: unknown): SsoLoginError {
    if (error instanceof SsoLoginError) {
        return error
    }
    if (!isAxiosError(error) || isNil(error.response)) {
        const reason = isAxiosError(error) ? error.message : 'unknown error'
        return new SsoLoginError({ code: SsoLoginErrorCode.PROVIDER_UNREACHABLE, detail: `The token endpoint could not be reached: ${reason}` })
    }
    const body: unknown = error.response.data
    const oauthError = isRecord(body) && typeof body['error'] === 'string' ? body['error'] : `HTTP ${error.response.status}`
    const description = isRecord(body) && typeof body['error_description'] === 'string' ? body['error_description'] : ''
    const code = oauthError === 'invalid_client' || error.response.status === 401 ? SsoLoginErrorCode.CLIENT_REJECTED : SsoLoginErrorCode.CODE_REJECTED
    return new SsoLoginError({ code, detail: `The token endpoint answered ${oauthError}${description.length > 0 ? ` (${description})` : ''}` })
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const HTTP_TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 5 * 60 * 1000
const CLOCK_TOLERANCE_SECONDS = 60
const ASYMMETRIC_ALGORITHMS: Algorithm[] = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512']

const discoveryCache = new Map<string, { discovery: OidcDiscovery, expiresAt: number }>()
const jwksCache = new Map<string, { keys: Jwk[], expiresAt: number }>()

const httpEndpoint = z.string().regex(/^https?:\/\/\S+$/)

const DiscoveryDocument = z.object({
    issuer: z.string(),
    authorization_endpoint: httpEndpoint,
    token_endpoint: httpEndpoint,
    jwks_uri: httpEndpoint,
    userinfo_endpoint: httpEndpoint.optional(),
    token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
})

const TokenResponse = z.object({
    id_token: z.string(),
    access_token: z.string().optional(),
})

const Jwk = z.object({
    kty: z.string(),
    kid: z.string().optional(),
    use: z.string().optional(),
    alg: z.string().optional(),
}).catchall(z.unknown())

const JwksDocument = z.object({
    keys: z.array(Jwk),
})

export const oidcClient = {
    discover,
    buildAuthorizationUrl,
    exchangeCode,
    verifyIdToken,
    fetchUserinfo,
    randomToken,
    challengeFor,
    clearCache,
}

export type OidcDiscovery = {
    issuer: string
    authorizationEndpoint: string
    tokenEndpoint: string
    jwksUri: string
    userinfoEndpoint: string | null
    tokenAuthMethods: string[]
}

export type OidcTokens = {
    idToken: string
    accessToken: string | null
}

type Jwk = z.infer<typeof Jwk>

type DiscoverParams = {
    issuer: string
}

type BuildAuthorizationUrlParams = {
    discovery: OidcDiscovery
    clientId: string
    redirectUri: string
    scopes: string
    state: string
    nonce: string
    codeVerifier: string
}

type ExchangeCodeParams = {
    discovery: OidcDiscovery
    clientId: string
    clientSecret: string
    code: string
    redirectUri: string
    codeVerifier: string
}

type VerifyIdTokenParams = {
    idToken: string
    discovery: OidcDiscovery
    clientId: string
    nonce: string
}

type FetchUserinfoParams = {
    discovery: OidcDiscovery
    accessToken: string | null
    subject: string
}

type GetJsonParams = {
    url: string
    what: string
}

type FindSigningKeyParams = {
    discovery: OidcDiscovery
    keyId: string | null
    algorithm: Algorithm
}

type LoadJwksParams = {
    jwksUri: string
    forceRefresh: boolean
}

type PickKeyParams = {
    keys: Jwk[]
    keyId: string | null
    algorithm: string
}

type VerifySignedPayloadParams = {
    idToken: string
    key: KeyObject
    algorithm: Algorithm
    issuer: string
    clientId: string
}

type AssertNonceParams = {
    payload: Record<string, unknown>
    nonce: string
    clientId: string
}
