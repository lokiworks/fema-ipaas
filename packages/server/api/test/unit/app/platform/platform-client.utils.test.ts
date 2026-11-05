import { PlatformClientKind, PlatformScope } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { platformAccessUtils } from '../../../../src/app/platform/platform-access.utils'
import { platformClientUtils } from '../../../../src/app/platform/platform-client.utils'

describe('platform client utils', () => {
    describe('api keys', () => {
        it('issues a key whose token carries the prefix and secret but not the stored hash', () => {
            const key = platformClientUtils.generateApiKey()

            expect(key.token.startsWith('fpk_')).toBe(true)
            expect(key.token).toBe(`fpk_${key.keyPrefix}.${key.secret}`)
            expect(key.secretHash).toHaveLength(64)
            expect(key.token).not.toContain(key.secretHash)
        })

        it('parses an issued token back into prefix and secret', () => {
            const key = platformClientUtils.generateApiKey()

            expect(platformClientUtils.parseApiKey({ token: key.token })).toEqual({ keyPrefix: key.keyPrefix, secret: key.secret })
        })

        it('does not parse anything that is not an api key', () => {
            expect(platformClientUtils.parseApiKey({ token: 'eyJhbGciOi.payload.signature' })).toBeNull()
            expect(platformClientUtils.parseApiKey({ token: 'fpk_nodot' })).toBeNull()
            expect(platformClientUtils.parseApiKey({ token: 'fpk_.secret' })).toBeNull()
            expect(platformClientUtils.parseApiKey({ token: 'fpk_prefix.' })).toBeNull()
        })

        it('accepts the right secret and rejects a wrong one or a missing hash', () => {
            const key = platformClientUtils.generateApiKey()

            expect(platformClientUtils.secretMatches({ secret: key.secret, storedHash: key.secretHash })).toBe(true)
            expect(platformClientUtils.secretMatches({ secret: `${key.secret}x`, storedHash: key.secretHash })).toBe(false)
            expect(platformClientUtils.secretMatches({ secret: key.secret, storedHash: null })).toBe(false)
        })

        it('never issues the same key twice', () => {
            expect(platformClientUtils.generateApiKey().token).not.toBe(platformClientUtils.generateApiKey().token)
        })
    })

    describe('trusted issuers', () => {
        it('normalises trailing slashes and whitespace', () => {
            expect(platformClientUtils.normalizeIssuer({ issuer: ' https://iam.example.com/// ' })).toBe('https://iam.example.com')
        })

        it('lists sub, client_id and azp as the caller subjects', () => {
            expect(platformClientUtils.subjectsOf({ claims: { sub: 'a', client_id: 'b', azp: 'c', other: 'd' } })).toEqual(['a', 'b', 'c'])
            expect(platformClientUtils.subjectsOf({ claims: { sub: 42, client_id: '' } })).toEqual([])
        })

        it('allows a caller whose subject, client id or authorized party is on the list', () => {
            expect(platformClientUtils.isSubjectAllowed({ claims: { sub: 'svc-rental' }, allowedSubjects: ['svc-rental'] })).toBe(true)
            expect(platformClientUtils.isSubjectAllowed({ claims: { sub: 'x', client_id: 'rental-app' }, allowedSubjects: ['rental-app'] })).toBe(true)
            expect(platformClientUtils.isSubjectAllowed({ claims: { sub: 'x', azp: 'rental-app' }, allowedSubjects: ['rental-app'] })).toBe(true)
            expect(platformClientUtils.isSubjectAllowed({ claims: { sub: 'stranger' }, allowedSubjects: ['rental-app'] })).toBe(false)
        })
    })

    describe('scopes', () => {
        it('requires the exact scope', () => {
            expect(platformClientUtils.hasScope({ scopes: [PlatformScope.USAGE_READ], required: PlatformScope.USAGE_READ })).toBe(true)
            expect(platformClientUtils.hasScope({ scopes: [PlatformScope.USAGE_READ], required: PlatformScope.TENANT_PROVISION })).toBe(false)
        })
    })

    describe('public view', () => {
        it('never exposes the stored secret hash', () => {
            const view = platformClientUtils.toPublicClient({
                client: {
                    id: 'id',
                    created: '2026-01-01T00:00:00.000Z',
                    updated: '2026-01-01T00:00:00.000Z',
                    name: 'billing',
                    kind: PlatformClientKind.API_KEY,
                    keyPrefix: 'abc',
                    issuer: null,
                    allowedSubjects: [],
                    scopes: [PlatformScope.USAGE_READ],
                    lastUsedAt: null,
                    revokedAt: null,
                    secretHash: 'deadbeef',
                    createdByIdentityId: 'someone',
                },
            })

            expect(JSON.stringify(view)).not.toContain('deadbeef')
            expect(view).not.toHaveProperty('secretHash')
            expect(view).not.toHaveProperty('createdByIdentityId')
        })
    })
})

describe('platform access utils', () => {
    it('lets an api key manage any tenant', () => {
        expect(platformAccessUtils.mayManageTenant({ callerIssuer: null, tenantExternalIssuer: null })).toBe(true)
        expect(platformAccessUtils.mayManageTenant({ callerIssuer: null, tenantExternalIssuer: 'https://iam.example.com' })).toBe(true)
    })

    it('keeps a trusted issuer to the tenants that were provisioned for that issuer', () => {
        expect(platformAccessUtils.mayManageTenant({ callerIssuer: 'https://iam.example.com/', tenantExternalIssuer: 'https://iam.example.com' })).toBe(true)
        expect(platformAccessUtils.mayManageTenant({ callerIssuer: 'https://iam.example.com', tenantExternalIssuer: 'https://other.example.com' })).toBe(false)
        expect(platformAccessUtils.mayManageTenant({ callerIssuer: 'https://iam.example.com', tenantExternalIssuer: null })).toBe(false)
    })
})
