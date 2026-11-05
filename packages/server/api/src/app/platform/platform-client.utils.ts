import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { isNil } from '@fema-ipaas/core-utils'
import { PLATFORM_API, PlatformClient, PlatformScope } from '@fema-ipaas/shared'

function hashSecret({ secret }: { secret: string }): string {
    return createHash('sha256').update(secret).digest('hex')
}

function generateApiKey(): GeneratedApiKey {
    const keyPrefix = randomBytes(6).toString('hex')
    const secret = randomBytes(32).toString('base64url')
    return {
        keyPrefix,
        secret,
        secretHash: hashSecret({ secret }),
        token: `${PLATFORM_API.apiKeyPrefix}${keyPrefix}.${secret}`,
    }
}

function parseApiKey({ token }: { token: string }): ParsedApiKey | null {
    if (!token.startsWith(PLATFORM_API.apiKeyPrefix)) {
        return null
    }
    const rest = token.slice(PLATFORM_API.apiKeyPrefix.length)
    const separator = rest.indexOf('.')
    if (separator <= 0 || separator === rest.length - 1) {
        return null
    }
    return { keyPrefix: rest.slice(0, separator), secret: rest.slice(separator + 1) }
}

function secretMatches({ secret, storedHash }: { secret: string, storedHash: string | null }): boolean {
    if (isNil(storedHash)) {
        return false
    }
    const candidate = Buffer.from(hashSecret({ secret }))
    const stored = Buffer.from(storedHash)
    return candidate.length === stored.length && timingSafeEqual(candidate, stored)
}

function normalizeIssuer({ issuer }: { issuer: string }): string {
    return issuer.trim().replace(/\/+$/, '')
}

function subjectsOf({ claims }: { claims: Record<string, unknown> }): string[] {
    return ['sub', 'client_id', 'azp']
        .map((key) => claims[key])
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
}

function isSubjectAllowed({ claims, allowedSubjects }: { claims: Record<string, unknown>, allowedSubjects: string[] }): boolean {
    return subjectsOf({ claims }).some((subject) => allowedSubjects.includes(subject))
}

function hasScope({ scopes, required }: { scopes: PlatformScope[], required: PlatformScope }): boolean {
    return scopes.includes(required)
}

function toPublicClient({ client }: { client: PlatformClient & { secretHash?: string | null, createdByIdentityId?: string | null } }): PlatformClient {
    return {
        id: client.id,
        created: client.created,
        updated: client.updated,
        name: client.name,
        kind: client.kind,
        keyPrefix: client.keyPrefix,
        issuer: client.issuer,
        allowedSubjects: client.allowedSubjects,
        scopes: client.scopes,
        lastUsedAt: client.lastUsedAt,
        revokedAt: client.revokedAt,
    }
}

export const platformClientUtils = {
    hashSecret,
    generateApiKey,
    parseApiKey,
    secretMatches,
    normalizeIssuer,
    subjectsOf,
    isSubjectAllowed,
    hasScope,
    toPublicClient,
}

type GeneratedApiKey = {
    keyPrefix: string
    secret: string
    secretHash: string
    token: string
}

type ParsedApiKey = {
    keyPrefix: string
    secret: string
}
