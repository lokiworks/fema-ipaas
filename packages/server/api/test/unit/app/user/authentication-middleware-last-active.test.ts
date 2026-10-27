import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authenticateOrThrow, updateLastActiveDate } = vi.hoisted(() => ({
    authenticateOrThrow: vi.fn(),
    updateLastActiveDate: vi.fn(),
}))

vi.mock('../../../../src/app/core/security/v2/authn/authenticate', () => ({ authenticateOrThrow }))
vi.mock('../../../../src/app/user/user-service', () => ({ userService: () => ({ updateLastActiveDate }) }))

import { authenticationMiddleware } from '../../../../src/app/core/security/v2/authn/authentication-middleware'
import { lastActiveTracker } from '../../../../src/app/user/last-active-tracker'

const RouteKindPrivate = { kind: 'PRIVATE' }

function createRequest(): FastifyRequest {
    return {
        routeOptions: { config: { security: RouteKindPrivate } },
        headers: { authorization: 'Bearer token' },
        log: { warn: vi.fn() },
    } as unknown as FastifyRequest
}

describe('authenticationMiddleware last active tracking', () => {
    beforeEach(() => {
        lastActiveTracker.reset()
        authenticateOrThrow.mockReset()
        updateLastActiveDate.mockReset()
        updateLastActiveDate.mockResolvedValue(undefined)
    })

    it('records the last active time of a signed-in user once per interval', async () => {
        authenticateOrThrow.mockResolvedValue({ id: 'user-1', type: PrincipalType.USER, tenant: { id: 'tenant-1' } })
        await authenticationMiddleware(createRequest())
        await authenticationMiddleware(createRequest())
        expect(updateLastActiveDate).toHaveBeenCalledTimes(1)
        expect(updateLastActiveDate).toHaveBeenCalledWith({ id: 'user-1', tenantId: 'tenant-1' })
    })

    it('does not touch the database for engine principals', async () => {
        authenticateOrThrow.mockResolvedValue({ id: 'engine-1', type: PrincipalType.ENGINE, projectId: 'p', tenant: { id: 'tenant-1' } })
        await authenticationMiddleware(createRequest())
        expect(updateLastActiveDate).not.toHaveBeenCalled()
    })
})
