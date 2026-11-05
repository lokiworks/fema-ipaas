import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { CaptchaProvider, CaptchaSolution } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => new Map<string, string>())

vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedStore: {
        putIfAbsent: async (key: string, value: string) => {
            if (store.has(key)) {
                return false
            }
            store.set(key, value)
            return true
        },
    },
}))

const provider = vi.hoisted(() => ({ current: 'BUILTIN' }))

vi.mock('../../../../src/app/authentication/captcha/captcha-settings', () => ({
    captchaSettings: {
        getProvider: async () => provider.current,
    },
}))

const turnstileCalls = vi.hoisted(() => ({ calls: 0 }))

vi.mock('../../../../src/app/authentication/lib/turnstile', () => ({
    turnstile: {
        assertSolved: async () => {
            turnstileCalls.calls += 1
        },
    },
}))

vi.mock('../../../../src/app/helper/jwt-utils', () => ({
    jwtUtils: {
        getJwtSecret: async () => 'captcha-service-test-secret',
    },
}))

const { captcha } = await import('../../../../src/app/authentication/captcha/captcha')
const { captchaPow } = await import('../../../../src/app/authentication/captcha/captcha-pow')

const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger

async function solvedToken(): Promise<string> {
    const challenge = await captcha.createChallenge()
    const solution = captchaPow.solve({ challenge })
    if (solution === null) {
        throw new Error('challenge was not solvable')
    }
    return captchaPow.encodeSolution({ solution })
}

async function codeOf(promise: Promise<unknown>): Promise<ErrorCode | null> {
    try {
        await promise
        return null
    }
    catch (error) {
        return error instanceof ApplicationError ? error.error.code : null
    }
}

beforeEach(() => {
    store.clear()
    provider.current = CaptchaProvider.BUILTIN
    turnstileCalls.calls = 0
})

describe('captcha.assertSolved', () => {
    it('asks for a captcha when no token comes with the request', async () => {
        expect(await codeOf(captcha.assertSolved({ token: undefined, remoteIp: '1.1.1.1', log }))).toBe(ErrorCode.CAPTCHA_REQUIRED)
    })

    it('accepts a freshly solved proof of work', async () => {
        await expect(captcha.assertSolved({ token: await solvedToken(), remoteIp: '1.1.1.1', log })).resolves.toBeUndefined()
    })

    it('refuses to accept the same proof twice', async () => {
        const token = await solvedToken()
        await captcha.assertSolved({ token, remoteIp: '1.1.1.1', log })
        expect(await codeOf(captcha.assertSolved({ token, remoteIp: '1.1.1.1', log }))).toBe(ErrorCode.VALIDATION)
    })

    it('refuses garbage and tampered solutions', async () => {
        expect(await codeOf(captcha.assertSolved({ token: 'garbage', remoteIp: undefined, log }))).toBe(ErrorCode.VALIDATION)
        const decoded = captchaPow.decodeSolution({ token: await solvedToken() })
        const tampered: CaptchaSolution | null = decoded === null ? null : { ...decoded, number: decoded.number + 1 }
        if (tampered === null) {
            throw new Error('token did not decode')
        }
        expect(await codeOf(captcha.assertSolved({ token: captchaPow.encodeSolution({ solution: tampered }), remoteIp: undefined, log }))).toBe(ErrorCode.VALIDATION)
    })

    it('hands the token to Turnstile when the instance runs on it', async () => {
        provider.current = CaptchaProvider.TURNSTILE
        await captcha.assertSolved({ token: 'turnstile-token', remoteIp: '1.1.1.1', log })
        expect(turnstileCalls.calls).toBe(1)
    })
})
