import { createHash } from 'node:crypto'
import { LOGIN_METHOD_LIMITS } from '@fema-ipaas/shared'
import { redisCounter } from '../lib/redis-counter'

async function captchaRequired({ email, ip }: SubjectParams): Promise<boolean> {
    const [byEmail, byIp] = await Promise.all([
        redisCounter.read({ key: emailKey({ email }) }),
        redisCounter.read({ key: ipKey({ ip }) }),
    ])
    return Math.max(byEmail, byIp) >= LOGIN_METHOD_LIMITS.loginFailuresBeforeCaptcha
}

async function recordFailure({ email, ip }: SubjectParams): Promise<void> {
    await Promise.all([
        redisCounter.increment({ key: emailKey({ email }), ttlSeconds: WINDOW_SECONDS }),
        redisCounter.increment({ key: ipKey({ ip }), ttlSeconds: WINDOW_SECONDS }),
    ])
}

async function clear({ email }: Pick<SubjectParams, 'email'>): Promise<void> {
    await redisCounter.reset({ key: emailKey({ email }) })
}

function emailKey({ email }: Pick<SubjectParams, 'email'>): string {
    return `login-failures:email:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`
}

function ipKey({ ip }: Pick<SubjectParams, 'ip'>): string {
    return `login-failures:ip:${ip}`
}

const WINDOW_SECONDS = 15 * 60

export const loginFailureTracker = {
    captchaRequired,
    recordFailure,
    clear,
}

type SubjectParams = {
    email: string
    ip: string
}
