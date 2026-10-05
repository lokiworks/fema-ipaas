import { createHash, createHmac, generateKeyPairSync, KeyObject, randomBytes, sign as signBytes } from 'node:crypto'
import http from 'node:http'

export async function startFakeIdp({ port = 0, clientId = 'fema-test', clientSecret: initialSecret = 'test-secret-value' }: StartParams = {}): Promise<FakeIdp> {
    const secrets = { current: initialSecret }
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const rogue = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: KEY_ID, use: 'sig', alg: 'RS256' }
    const state: IdpState = {
        issuer: '',
        directory: new Map(),
        codes: new Map(),
        accessTokens: new Map(),
        next: { email: '' },
        discoveryIssuer: null,
        tokenCalls: 0,
        redirectUris: [],
    }
    const server = http.createServer((req, res) => {
        handle({ req, res, state, clientId, secrets, privateKey, rogueKey: rogue.privateKey, publicJwk }).catch((error: unknown) => {
            res.statusCode = 500
            res.end(String(error))
        })
    })
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
    const address = server.address()
    state.issuer = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : port}`
    return {
        issuer: state.issuer,
        clientId,
        clientSecret: initialSecret,
        rotateSecret: (secret) => {
            secrets.current = secret
        },
        setUser: ({ email, claims }) => {
            state.directory.set(email, claims)
        },
        setNext: (behavior) => {
            state.next = behavior
        },
        setDiscoveryIssuer: (issuer) => {
            state.discoveryIssuer = issuer
        },
        allowRedirect: (uri) => {
            state.redirectUris.push(uri)
        },
        tokenCalls: () => state.tokenCalls,
        close: () => new Promise<void>((resolve) => {
            server.closeAllConnections()
            server.close(() => resolve())
        }),
    }
}

async function handle({ req, res, state, clientId, secrets, privateKey, rogueKey, publicJwk }: HandleParams): Promise<void> {
    const url = new URL(req.url ?? '/', state.issuer)
    if (url.pathname === '/.well-known/openid-configuration') {
        return json({ res, body: {
            issuer: state.discoveryIssuer ?? state.issuer,
            authorization_endpoint: `${state.issuer}/authorize`,
            token_endpoint: `${state.issuer}/token`,
            jwks_uri: `${state.issuer}/jwks`,
            userinfo_endpoint: `${state.issuer}/userinfo`,
            token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
            id_token_signing_alg_values_supported: ['RS256'],
        } })
    }
    if (url.pathname === '/jwks') {
        return json({ res, body: { keys: [publicJwk] } })
    }
    if (url.pathname === '/authorize') {
        const redirectUri = url.searchParams.get('redirect_uri') ?? ''
        if (url.searchParams.get('client_id') !== clientId || !state.redirectUris.includes(redirectUri)) {
            res.statusCode = 400
            res.end('invalid client or redirect_uri')
            return
        }
        const target = new URL(redirectUri)
        if (state.next.deny === true) {
            target.searchParams.set('error', 'access_denied')
            target.searchParams.set('error_description', 'user cancelled')
            target.searchParams.set('state', url.searchParams.get('state') ?? '')
            res.statusCode = 302
            res.setHeader('location', target.toString())
            res.end()
            return
        }
        const code = randomBytes(16).toString('hex')
        state.codes.set(code, {
            behavior: state.next,
            nonce: url.searchParams.get('nonce') ?? '',
            challenge: url.searchParams.get('code_challenge') ?? '',
            redirectUri,
            used: false,
            issuedAt: Date.now(),
            accessToken: randomBytes(16).toString('hex'),
        })
        target.searchParams.set('code', code)
        target.searchParams.set('state', url.searchParams.get('state') ?? '')
        res.statusCode = 302
        res.setHeader('location', target.toString())
        res.end()
        return
    }
    if (url.pathname === '/token' && req.method === 'POST') {
        state.tokenCalls += 1
        const body = new URLSearchParams(await readBody(req))
        const credentials = clientCredentials({ req, body })
        if (credentials.id !== clientId || credentials.secret !== secrets.current) {
            return json({ res, status: 401, body: { error: 'invalid_client', error_description: 'client authentication failed' } })
        }
        const record = state.codes.get(body.get('code') ?? '')
        const expired = record !== undefined && record.behavior.expireCode === true
        if (record === undefined || record.used || expired || record.redirectUri !== body.get('redirect_uri')) {
            return json({ res, status: 400, body: { error: 'invalid_grant', error_description: 'authorization code is invalid, expired or already used' } })
        }
        const verifier = body.get('code_verifier') ?? ''
        if (createHash('sha256').update(verifier).digest('base64url') !== record.challenge) {
            return json({ res, status: 400, body: { error: 'invalid_grant', error_description: 'PKCE verification failed' } })
        }
        record.used = true
        const claims = state.directory.get(record.behavior.email)
        if (claims === undefined) {
            return json({ res, status: 400, body: { error: 'invalid_grant', error_description: 'unknown user' } })
        }
        state.accessTokens.set(record.accessToken, claims)
        const idToken = buildIdToken({ state, record, claims, clientId, privateKey, rogueKey })
        return json({ res, body: { access_token: record.accessToken, token_type: 'Bearer', expires_in: 600, id_token: idToken } })
    }
    if (url.pathname === '/userinfo') {
        const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
        const claims = state.accessTokens.get(token)
        if (claims === undefined) {
            return json({ res, status: 401, body: { error: 'invalid_token' } })
        }
        return json({ res, body: claims })
    }
    res.statusCode = 404
    res.end('not found')
}

function buildIdToken({ state, record, claims, clientId, privateKey, rogueKey }: BuildIdTokenParams): string {
    const now = Math.floor(Date.now() / 1000)
    const tamper = record.behavior.tamper
    const stripped = record.behavior.omitClaims ?? []
    const payload: Record<string, unknown> = {
        ...Object.fromEntries(Object.entries(claims).filter(([key]) => !stripped.includes(key))),
        iss: tamper === 'wrong-issuer' ? 'https://evil.example.com' : state.issuer,
        aud: tamper === 'wrong-audience' ? 'some-other-client' : clientId,
        nonce: tamper === 'wrong-nonce' ? 'not-the-nonce-we-sent' : record.nonce,
        iat: now,
        exp: tamper === 'expired' ? now - 3600 : now + 600,
        ...(tamper === 'missing-sub' ? { sub: undefined } : {}),
    }
    const header = { alg: 'RS256', typ: 'JWT', kid: tamper === 'unknown-kid' ? 'does-not-exist' : KEY_ID }
    if (tamper === 'alg-none') {
        return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`
    }
    if (tamper === 'hs256-confusion') {
        const signingInput = `${b64({ alg: 'HS256', typ: 'JWT', kid: KEY_ID })}.${b64(payload)}`
        const signature = createHmac('sha256', 'public-key-material').update(signingInput).digest('base64url')
        return `${signingInput}.${signature}`
    }
    const signingInput = `${b64(header)}.${b64(payload)}`
    const key = tamper === 'bad-signature' ? rogueKey : privateKey
    const signature = signBytes('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url')
    return `${signingInput}.${signature}`
}

function clientCredentials({ req, body }: { req: http.IncomingMessage, body: URLSearchParams }): { id: string, secret: string } {
    const header = req.headers.authorization
    if (header?.startsWith('Basic ')) {
        const [id, secret] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':')
        return { id: decodeURIComponent(id ?? ''), secret: decodeURIComponent(secret ?? '') }
    }
    return { id: body.get('client_id') ?? '', secret: body.get('client_secret') ?? '' }
}

function b64(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function json({ res, body, status = 200 }: { res: http.ServerResponse, body: unknown, status?: number }): void {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
        let data = ''
        req.on('data', (chunk: Buffer) => {
            data += chunk.toString()
        })
        req.on('end', () => resolve(data))
    })
}

const KEY_ID = 'fake-key-1'

export type Tamper = 'bad-signature' | 'wrong-issuer' | 'wrong-audience' | 'wrong-nonce' | 'expired' | 'alg-none' | 'hs256-confusion' | 'unknown-kid' | 'missing-sub'

export type NextBehavior = {
    email: string
    tamper?: Tamper
    expireCode?: boolean
    deny?: boolean
    omitClaims?: string[]
}

export type FakeIdp = {
    issuer: string
    clientId: string
    clientSecret: string
    rotateSecret: (secret: string) => void
    setUser: (params: { email: string, claims: Record<string, unknown> }) => void
    setNext: (behavior: NextBehavior) => void
    setDiscoveryIssuer: (issuer: string | null) => void
    allowRedirect: (uri: string) => void
    tokenCalls: () => number
    close: () => Promise<void>
}

type StartParams = {
    port?: number
    clientId?: string
    clientSecret?: string
}

type CodeRecord = {
    behavior: NextBehavior
    nonce: string
    challenge: string
    redirectUri: string
    used: boolean
    issuedAt: number
    accessToken: string
}

type IdpState = {
    issuer: string
    directory: Map<string, Record<string, unknown>>
    codes: Map<string, CodeRecord>
    accessTokens: Map<string, Record<string, unknown>>
    next: NextBehavior
    discoveryIssuer: string | null
    tokenCalls: number
    redirectUris: string[]
}

type HandleParams = {
    req: http.IncomingMessage
    res: http.ServerResponse
    state: IdpState
    clientId: string
    secrets: { current: string }
    privateKey: KeyObject
    rogueKey: KeyObject
    publicJwk: Record<string, unknown>
}

type BuildIdTokenParams = {
    state: IdpState
    record: CodeRecord
    claims: Record<string, unknown>
    clientId: string
    privateKey: HandleParams['privateKey']
    rogueKey: HandleParams['rogueKey']
}
