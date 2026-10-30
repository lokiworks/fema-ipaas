import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { jwtUtils } from '../../../../src/app/helper/jwt-utils'

const SECRET = 'verify-principal-test-secret'

vi.mock('../../../../src/app/user/user-service', () => ({
    userService: () => ({
        getOneOrFail: vi.fn().mockResolvedValue({
            id: 'user-1',
            identityId: 'identity-1',
            status: 'ACTIVE',
        }),
    }),
}))

vi.mock('../../../../src/app/authentication/user-identity/user-identity-service', () => ({
    userIdentityService: () => ({
        getOneOrFail: vi.fn().mockResolvedValue({
            id: 'identity-1',
            verified: true,
            tokenVersion: null,
            lastLoggedInTenantId: 'tenant-1',
        }),
    }),
}))

const revoked = vi.hoisted(() => new Set<string>())

vi.mock('../../../../src/app/authentication/lib/session-revocation', () => ({
    sessionRevocation: {
        isRevoked: async (token: string) => revoked.has(token),
        revoke: async ({ token }: { token: string }) => {
            revoked.add(token)
        },
    },
}))

const { accessTokenManager } = await import('../../../../src/app/authentication/lib/access-token-manager')

const mockLog: FastifyBaseLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: 'info',
} as unknown as FastifyBaseLogger

const manager = accessTokenManager(mockLog)

beforeAll(() => {
    vi.spyOn(jwtUtils, 'getJwtSecret').mockResolvedValue(SECRET)
})

describe('verifyPrincipal', () => {
    it('accepts a token with a valid PrincipalType', async () => {
        const token = await jwtUtils.sign({
            payload: {
                id: 'worker-1',
                type: PrincipalType.WORKER,
            },
            key: SECRET,
            expiresInSeconds: 60,
        })

        const decoded = await manager.verifyPrincipal(token)
        expect(decoded.id).toBe('worker-1')
        expect(decoded.type).toBe(PrincipalType.WORKER)
    })

    it('rejects a token whose type is not a PrincipalType', async () => {
        const token = await jwtUtils.sign({
            payload: {
                id: 'x',
                type: 'NOT_A_REAL_TYPE',
            },
            key: SECRET,
            expiresInSeconds: 60,
        })

        await expect(manager.verifyPrincipal(token)).rejects.toThrow()
    })

    it('rejects a token with no type field', async () => {
        const token = await jwtUtils.sign({
            payload: {
                id: 'x',
            },
            key: SECRET,
            expiresInSeconds: 60,
        })

        await expect(manager.verifyPrincipal(token)).rejects.toThrow()
    })

    it('rejects a signed-out user token but keeps other sessions of the same user working', async () => {
        const signedOut = await jwtUtils.sign({
            payload: { id: 'user-1', type: PrincipalType.USER, tenant: { id: 'tenant-1' }, tokenVersion: null },
            key: SECRET,
            expiresInSeconds: 60,
        })
        const otherDevice = await jwtUtils.sign({
            payload: { id: 'user-1', type: PrincipalType.USER, tenant: { id: 'tenant-1' }, tokenVersion: null, device: 'second' },
            key: SECRET,
            expiresInSeconds: 60,
        })
        await expect(manager.verifyPrincipal(signedOut)).resolves.toMatchObject({ id: 'user-1' })
        await manager.revokeSession(signedOut)
        await expect(manager.verifyPrincipal(signedOut)).rejects.toMatchObject({ error: { code: 'SESSION_EXPIRED' } })
        await expect(manager.verifyPrincipal(otherDevice)).resolves.toMatchObject({ id: 'user-1' })
    })
})
