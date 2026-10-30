import { OtpState, OtpType } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rows = new Map<string, Record<string, unknown>>()

vi.mock('../../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({
        findOneBy: async ({ identityId, type }: { identityId: string, type: string }) => rows.get(`${identityId}:${type}`) ?? null,
        delete: async ({ id }: { id: string }) => {
            for (const [key, row] of rows) {
                if (row.id === id) {
                    rows.delete(key)
                }
            }
        },
        query: async (_sql: string, [id]: [string]) => {
            for (const row of rows.values()) {
                if (row.id === id) {
                    row.attempts = Number(row.attempts) + 1
                }
            }
        },
    }),
}))

vi.mock('../../../../../src/app/database/redis-connections', () => {
    const store = new Map<string, unknown>()
    return {
        distributedLock: () => ({ runExclusive: async ({ fn }: { fn: () => Promise<unknown> }) => fn() }),
        distributedStore: {
            get: async (key: string) => store.get(key) ?? null,
            put: async (key: string, value: unknown) => {
                store.set(key, value)
            },
            delete: async (key: string) => {
                store.delete(key)
            },
        },
    }
})

vi.mock('../../../../../src/app/helper/encryption', () => ({
    encryptUtils: {
        hmacString: async (value: string) => `h:${value}`,
        digestsMatch: (a: string, b: string) => a === b,
    },
}))

vi.mock('../../../../../src/app/helper/email/email-service', () => ({ emailService: () => ({ sendOtp: async () => undefined }) }))
vi.mock('../../../../../src/app/authentication/user-identity/user-identity-service', () => ({ userIdentityService: () => ({}) }))

import { otpService } from '../../../../../src/app/authentication/otp/otp-service'

const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }

describe('otpService.check', () => {
    beforeEach(() => {
        rows.clear()
        rows.set(`identity-1:${OtpType.PASSWORD_RESET}`, {
            id: 'otp-1',
            identityId: 'identity-1',
            type: OtpType.PASSWORD_RESET,
            value: 'h:123456',
            state: OtpState.PENDING,
            attempts: 0,
            version: 1,
            updated: new Date().toISOString(),
        })
    })

    it('accepts a valid reset link without using it up', async () => {
        const service = otpService(fastifyLog())

        expect(await service.check({ identityId: 'identity-1', type: OtpType.PASSWORD_RESET, value: '123456' })).toBe(true)
        expect(await service.check({ identityId: 'identity-1', type: OtpType.PASSWORD_RESET, value: '123456' })).toBe(true)
        expect(await service.confirm({ identityId: 'identity-1', type: OtpType.PASSWORD_RESET, value: '123456' })).toBe(true)
        expect(await service.check({ identityId: 'identity-1', type: OtpType.PASSWORD_RESET, value: '123456' })).toBe(false)
    })

    it('counts a wrong code as a guess so the check cannot be used to brute force', async () => {
        const service = otpService(fastifyLog())

        expect(await service.check({ identityId: 'identity-1', type: OtpType.PASSWORD_RESET, value: '000000' })).toBe(false)

        expect(rows.get(`identity-1:${OtpType.PASSWORD_RESET}`)?.attempts).toBe(1)
    })

    it('rejects an expired link', async () => {
        rows.set(`identity-1:${OtpType.PASSWORD_RESET}`, { ...rows.get(`identity-1:${OtpType.PASSWORD_RESET}`), updated: new Date(Date.now() - 11 * 60 * 1000).toISOString() })

        expect(await otpService(fastifyLog()).check({ identityId: 'identity-1', type: OtpType.PASSWORD_RESET, value: '123456' })).toBe(false)
    })

    it('rejects an unknown identity', async () => {
        expect(await otpService(fastifyLog()).check({ identityId: 'nobody', type: OtpType.PASSWORD_RESET, value: '123456' })).toBe(false)
    })
})

function fastifyLog(): Parameters<typeof otpService>[0] {
    return Object.assign(Object.create(null), log, { child: () => log, level: 'info', fatal: vi.fn(), trace: vi.fn(), silent: vi.fn() })
}
