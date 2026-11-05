import { ErrorCode } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticateOrThrow } from '../../../../../src/app/core/security/v2/authn/authenticate'

const assertActive = vi.fn()
const authenticatePat = vi.fn()
const verifyPrincipal = vi.fn()

vi.mock('../../../../../src/app/tenant/tenant-status-guard', () => ({
    tenantStatusGuard: { assertActive: (params: unknown) => assertActive(params) },
}))

vi.mock('../../../../../src/app/account/personal-access-token.service', () => ({
    personalAccessTokenService: () => ({ authenticate: (value: string) => authenticatePat(value) }),
}))

vi.mock('../../../../../src/app/authentication/lib/access-token-manager', () => ({
    accessTokenManager: () => ({ verifyPrincipal: (token: string) => verifyPrincipal(token) }),
}))

const log = {} as never

describe('authenticating against a suspended tenant', () => {
    beforeEach(() => {
        assertActive.mockReset()
        authenticatePat.mockReset()
        verifyPrincipal.mockReset()
    })

    it('rejects a personal access token of a suspended tenant', async () => {
        authenticatePat.mockResolvedValue({ id: 'u1', type: PrincipalType.USER, tenant: { id: 't1' } })
        assertActive.mockRejectedValue({ error: { code: ErrorCode.TENANT_SUSPENDED } })

        await expect(authenticateOrThrow(log, 'Bearer pat_abc')).rejects.toMatchObject({ error: { code: ErrorCode.TENANT_SUSPENDED } })
        expect(assertActive).toHaveBeenCalledWith({ tenantId: 't1' })
    })

    it('accepts a personal access token of an active tenant', async () => {
        const principal = { id: 'u1', type: PrincipalType.USER, tenant: { id: 't1' } }
        authenticatePat.mockResolvedValue(principal)
        assertActive.mockResolvedValue(undefined)

        await expect(authenticateOrThrow(log, 'Bearer pat_abc')).resolves.toEqual(principal)
    })

    it('rejects a service principal of a suspended tenant', async () => {
        verifyPrincipal.mockResolvedValue({ id: 's1', type: PrincipalType.SERVICE, tenant: { id: 't1' } })
        assertActive.mockRejectedValue({ error: { code: ErrorCode.TENANT_SUSPENDED } })

        await expect(authenticateOrThrow(log, 'Bearer jwt')).rejects.toMatchObject({ error: { code: ErrorCode.TENANT_SUSPENDED } })
    })

    it('leaves user sessions to the sign-in checks so a user can still switch away from a suspended tenant', async () => {
        verifyPrincipal.mockResolvedValue({ id: 'u1', type: PrincipalType.USER, tenant: { id: 't1' } })

        await authenticateOrThrow(log, 'Bearer jwt')

        expect(assertActive).not.toHaveBeenCalled()
    })

    it('does not check anything for an anonymous request', async () => {
        const principal = await authenticateOrThrow(log, null)

        expect(principal.type).toBe(PrincipalType.UNKNOWN)
        expect(assertActive).not.toHaveBeenCalled()
    })
})
