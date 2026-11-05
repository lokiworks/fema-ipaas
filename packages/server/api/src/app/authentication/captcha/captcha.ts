import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { CaptchaChallenge, CaptchaProvider, LOGIN_METHOD_LIMITS } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../../database/redis-connections'
import { jwtUtils } from '../../helper/jwt-utils'
import { turnstile } from '../lib/turnstile'
import { captchaPow } from './captcha-pow'
import { captchaSettings } from './captcha-settings'

async function createChallenge(): Promise<CaptchaChallenge> {
    return captchaPow.createChallenge({
        key: await signingKey(),
        nowSeconds: nowSeconds(),
        ttlSeconds: LOGIN_METHOD_LIMITS.captchaTtlSeconds,
        maxNumber: LOGIN_METHOD_LIMITS.captchaMaxNumber,
    })
}

async function assertSolved({ token, remoteIp, log }: AssertSolvedParams): Promise<void> {
    if (isNil(token) || token.length === 0) {
        throw new ApplicationError({ code: ErrorCode.CAPTCHA_REQUIRED, params: {} })
    }
    const provider = await captchaSettings.getProvider()
    if (provider === CaptchaProvider.TURNSTILE) {
        await turnstile.assertSolved({ token, remoteIp, log })
        return
    }
    await assertBuiltinSolved({ token, log })
}

async function assertBuiltinSolved({ token, log }: AssertBuiltinSolvedParams): Promise<void> {
    const solution = captchaPow.decodeSolution({ token })
    if (isNil(solution)) {
        throw rejected()
    }
    const verdict = captchaPow.verifySolution({
        key: await signingKey(),
        solution,
        nowSeconds: nowSeconds(),
        maxNumber: LOGIN_METHOD_LIMITS.captchaMaxNumber,
    })
    if (!verdict.ok) {
        log.warn({ reason: verdict.reason }, '[captcha#assertSolved] proof of work rejected')
        throw rejected()
    }
    const remainingSeconds = Math.max(verdict.expiresAt - nowSeconds(), 1) + REPLAY_MARGIN_SECONDS
    const firstUse = await distributedStore.putIfAbsent(`captcha-used:${verdict.challenge}`, '1', remainingSeconds)
    if (!firstUse) {
        log.warn('[captcha#assertSolved] proof of work replayed')
        throw rejected()
    }
}

async function signingKey(): Promise<string> {
    return captchaPow.deriveKey({ secret: await jwtUtils.getJwtSecret() })
}

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000)
}

function rejected(): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message: 'captchaVerificationFailed' },
    })
}

const REPLAY_MARGIN_SECONDS = 5

export const captcha = {
    createChallenge,
    assertSolved,
}

type AssertSolvedParams = {
    token: string | undefined
    remoteIp: string | undefined
    log: FastifyBaseLogger
}

type AssertBuiltinSolvedParams = {
    token: string
    log: FastifyBaseLogger
}
