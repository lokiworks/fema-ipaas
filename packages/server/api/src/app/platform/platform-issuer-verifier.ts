import { createPublicKey, KeyObject } from 'node:crypto'
import { isNil, tryCatch, tryCatchSync } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import jwt, { Algorithm } from 'jsonwebtoken'
import { z } from 'zod'

async function verify({ token, issuer }: { token: string, issuer: string }): Promise<Record<string, unknown> | null> {
    const decoded = jwt.decode(token, { complete: true })
    if (isNil(decoded) || typeof decoded.payload === 'string') {
        return null
    }
    const algorithm = ACCEPTED_ALGORITHMS.find((candidate) => candidate === decoded.header.alg)
    if (isNil(algorithm)) {
        return null
    }
    const key = await findSigningKey({ issuer, keyId: decoded.header.kid ?? null, algorithm })
    if (isNil(key)) {
        return null
    }
    const { data, error } = await tryCatch(async () => jwt.verify(token, key, { algorithms: [algorithm], issuer: issuerVariants({ issuer }), clockTolerance: CLOCK_TOLERANCE_SECONDS }))
    if (!isNil(error) || isNil(data) || typeof data === 'string') {
        return null
    }
    return { ...data }
}

function unverifiedIssuer({ token }: { token: string }): string | null {
    const decoded = jwt.decode(token)
    if (isNil(decoded) || typeof decoded === 'string') {
        return null
    }
    const issuer = decoded['iss']
    return typeof issuer === 'string' && issuer.length > 0 ? issuer : null
}

function issuerVariants({ issuer }: { issuer: string }): [string, string] {
    const bare = issuer.replace(/\/+$/, '')
    return [bare, `${bare}/`]
}

async function findSigningKey({ issuer, keyId, algorithm }: FindSigningKeyParams): Promise<KeyObject | null> {
    const first = await loadKeys({ issuer, forceRefresh: false })
    const firstMatch = pickKey({ keys: first, keyId, algorithm })
    if (!isNil(firstMatch)) {
        return toKeyObject({ jwk: firstMatch })
    }
    const second = await loadKeys({ issuer, forceRefresh: true })
    const secondMatch = pickKey({ keys: second, keyId, algorithm })
    return isNil(secondMatch) ? null : toKeyObject({ jwk: secondMatch })
}

async function loadKeys({ issuer, forceRefresh }: { issuer: string, forceRefresh: boolean }): Promise<Jwk[]> {
    const cacheKey = issuer.replace(/\/+$/, '')
    const cached = keyCache.get(cacheKey)
    if (!forceRefresh && !isNil(cached) && cached.expiresAt > Date.now()) {
        return cached.keys
    }
    const { data: discovery } = await tryCatch(() => safeHttp.axios.get<unknown>(`${cacheKey}/.well-known/openid-configuration`, { timeout: HTTP_TIMEOUT_MS, maxRedirects: 0 }))
    const parsedDiscovery = DiscoveryDocument.safeParse(discovery?.data)
    if (!parsedDiscovery.success) {
        return []
    }
    const { data: jwks } = await tryCatch(() => safeHttp.axios.get<unknown>(parsedDiscovery.data.jwks_uri, { timeout: HTTP_TIMEOUT_MS, maxRedirects: 0 }))
    const parsedJwks = JwksDocument.safeParse(jwks?.data)
    if (!parsedJwks.success) {
        return []
    }
    keyCache.set(cacheKey, { keys: parsedJwks.data.keys, expiresAt: Date.now() + CACHE_TTL_MS })
    return parsedJwks.data.keys
}

function pickKey({ keys, keyId, algorithm }: { keys: Jwk[], keyId: string | null, algorithm: Algorithm }): Jwk | undefined {
    const usable = keys.filter((key) => (isNil(key.use) || key.use === 'sig') && (isNil(key.alg) || key.alg === algorithm))
    if (isNil(keyId)) {
        return usable.length === 1 ? usable[0] : undefined
    }
    return usable.find((key) => key.kid === keyId)
}

function toKeyObject({ jwk }: { jwk: Jwk }): KeyObject | null {
    const { data } = tryCatchSync(() => createPublicKey({ key: jwk, format: 'jwk' }))
    return data
}

function clearCache(): void {
    keyCache.clear()
}

export const platformIssuerVerifier = {
    verify,
    unverifiedIssuer,
    clearCache,
}

const ACCEPTED_ALGORITHMS: Algorithm[] = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512']
const HTTP_TIMEOUT_MS = 5_000
const CACHE_TTL_MS = 5 * 60 * 1000
const CLOCK_TOLERANCE_SECONDS = 30
const keyCache = new Map<string, { keys: Jwk[], expiresAt: number }>()

const Jwk = z.object({
    kty: z.string(),
    kid: z.string().optional(),
    use: z.string().optional(),
    alg: z.string().optional(),
}).catchall(z.unknown())
type Jwk = z.infer<typeof Jwk>

const JwksDocument = z.object({ keys: z.array(Jwk) })
const DiscoveryDocument = z.object({ jwks_uri: z.string().url() })

type FindSigningKeyParams = {
    issuer: string
    keyId: string | null
    algorithm: Algorithm
}
