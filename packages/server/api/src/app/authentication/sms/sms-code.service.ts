import { createHash, randomInt } from 'node:crypto'
import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { LOGIN_METHOD_LIMITS } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { distributedLock, distributedStore } from '../../database/redis-connections'
import { encryptUtils } from '../../helper/encryption'
import { redisCounter } from '../lib/redis-counter'
import { smsSender } from './sms-sender'
import { smsSettingsService } from './sms-settings.service'

const MAX_ATTEMPTS = 5
const DAILY_WINDOW_SECONDS = 24 * 60 * 60

export const smsCodeService = (log: FastifyBaseLogger) => ({
    async reserveSlot({ phone }: PhoneParams): Promise<void> {
        const claimed = await distributedStore.putIfAbsent(resendKey({ phone }), '1', LOGIN_METHOD_LIMITS.smsResendSeconds)
        if (!claimed) {
            throw validation('smsResendTooSoon')
        }
        const sentToday = await redisCounter.increment({ key: dailyKey({ phone }), ttlSeconds: DAILY_WINDOW_SECONDS })
        if (sentToday > LOGIN_METHOD_LIMITS.smsDailyLimitPerPhone) {
            throw validation('smsDailyLimitReached')
        }
    },

    async send({ phone, purpose }: PurposeParams): Promise<void> {
        const config = await smsSettingsService.getConfigIfAvailable()
        const code = randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, '0')
        const stored: StoredCode = {
            hash: await encryptUtils.hmacString(`sms:${purpose}:${phone}:${code}`),
            attempts: 0,
            expiresAt: Date.now() + LOGIN_METHOD_LIMITS.smsCodeTtlSeconds * 1000,
        }
        await distributedStore.put(codeKey({ phone, purpose }), stored, LOGIN_METHOD_LIMITS.smsCodeTtlSeconds)
        const result = await smsSender.send({ config, phone, code })
        if (!result.ok) {
            await distributedStore.delete(codeKey({ phone, purpose }))
            log.error({ reason: result.reason }, '[sms] delivery failed')
            throw validation('smsDeliveryFailed')
        }
    },

    async verify({ phone, purpose, code }: VerifyParams): Promise<boolean> {
        return distributedLock(log).runExclusive({
            key: `sms-verify-${hashOf({ value: `${purpose}:${phone}` })}`,
            timeoutInSeconds: 15,
            fn: async () => {
                const key = codeKey({ phone, purpose })
                const stored = await distributedStore.get<StoredCode>(key)
                if (isNil(stored) || stored.expiresAt <= Date.now() || stored.attempts >= MAX_ATTEMPTS) {
                    await distributedStore.delete(key)
                    return false
                }
                const candidate = await encryptUtils.hmacString(`sms:${purpose}:${phone}:${code}`)
                if (encryptUtils.digestsMatch(stored.hash, candidate)) {
                    await distributedStore.delete(key)
                    return true
                }
                const attempts = stored.attempts + 1
                if (attempts >= MAX_ATTEMPTS) {
                    await distributedStore.delete(key)
                    return false
                }
                const remainingSeconds = Math.max(Math.ceil((stored.expiresAt - Date.now()) / 1000), 1)
                await distributedStore.put(key, { ...stored, attempts }, remainingSeconds)
                return false
            },
        })
    },
})

function codeKey({ phone, purpose }: PurposeParams): string {
    return `sms-code:${purpose}:${hashOf({ value: phone })}`
}

function resendKey({ phone }: PhoneParams): string {
    return `sms-resend:${hashOf({ value: phone })}`
}

function dailyKey({ phone }: PhoneParams): string {
    return `sms-daily:${hashOf({ value: phone })}`
}

function hashOf({ value }: HashOfParams): string {
    return createHash('sha256').update(value).digest('hex')
}

function validation(message: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

const CODE_LENGTH = 6

export enum SmsCodePurpose {
    LOGIN = 'LOGIN',
    BIND = 'BIND',
}

type StoredCode = {
    hash: string
    attempts: number
    expiresAt: number
}

type PhoneParams = {
    phone: string
}

type PurposeParams = PhoneParams & {
    purpose: SmsCodePurpose
}

type VerifyParams = PurposeParams & {
    code: string
}

type HashOfParams = {
    value: string
}
