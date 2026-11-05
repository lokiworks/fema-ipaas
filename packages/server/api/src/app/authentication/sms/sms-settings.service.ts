import { randomInt } from 'node:crypto'
import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { SmsProviderKind, SmsSettingsPublic, UpdateSmsSettingsRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { repoFactory } from '../../core/db/repo-factory'
import { FlagEntity } from '../../flags/flag.entity'
import { EncryptedObject, encryptUtils } from '../../helper/encryption'
import { SmsProviderConfig } from './sms-provider'
import { smsSender } from './sms-sender'

const flagRepo = repoFactory(FlagEntity)

export const smsSettingsService = {
    async getPublic(): Promise<SmsSettingsPublic | null> {
        const stored = await readStored()
        return isNil(stored) ? null : toPublic({ stored })
    },

    async isAvailable(): Promise<boolean> {
        const stored = await readStored()
        return !isNil(stored) && !isNil(stored.verifiedAt)
    },

    async getConfig(): Promise<SmsProviderConfig | null> {
        const stored = await readStored()
        if (isNil(stored)) {
            return null
        }
        return {
            provider: stored.provider,
            accessKeyId: stored.accessKeyId,
            accessKeySecret: await encryptUtils.decryptString(stored.accessKeySecret),
            signName: stored.signName,
            templateCode: stored.templateCode,
            sdkAppId: stored.sdkAppId,
            region: stored.region,
        }
    },

    async getConfigIfAvailable(): Promise<SmsProviderConfig> {
        const stored = await readStored()
        const config = isNil(stored) || isNil(stored.verifiedAt) ? null : await this.getConfig()
        if (isNil(config)) {
            throw smsSender.notConfigured()
        }
        return config
    },

    async update({ request }: UpdateParams): Promise<SmsSettingsPublic> {
        const existing = await readStored()
        const accessKeySecret = isNil(request.accessKeySecret)
            ? existing?.accessKeySecret
            : await encryptUtils.encryptString(request.accessKeySecret)
        if (isNil(accessKeySecret)) {
            throw validation('smsAccessKeySecretRequired')
        }
        if (request.provider === 'TENCENT' && (isNil(request.sdkAppId) || request.sdkAppId.length === 0)) {
            throw validation('smsSdkAppIdRequired')
        }
        const stored: StoredSmsSettings = {
            provider: request.provider,
            accessKeyId: request.accessKeyId,
            accessKeySecret,
            signName: request.signName,
            templateCode: request.templateCode,
            sdkAppId: emptyToNull({ value: request.sdkAppId }),
            region: emptyToNull({ value: request.region }),
            verifiedAt: null,
        }
        await flagRepo().save({ id: SMS_SETTINGS_FLAG_ID, value: stored })
        return toPublic({ stored })
    },

    async sendTest({ phone, log }: SendTestParams): Promise<SmsSettingsPublic> {
        const config = await this.getConfig()
        const stored = await readStored()
        if (isNil(config) || isNil(stored)) {
            throw smsSender.notConfigured()
        }
        const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
        const result = await smsSender.send({ config, phone, code })
        if (!result.ok) {
            log.warn({ reason: result.reason }, '[sms] test message was rejected')
            throw validation(`SMS provider rejected the test message: ${result.reason}`)
        }
        const verified: StoredSmsSettings = { ...stored, verifiedAt: new Date().toISOString() }
        await flagRepo().save({ id: SMS_SETTINGS_FLAG_ID, value: verified })
        return toPublic({ stored: verified })
    },
}

async function readStored(): Promise<StoredSmsSettings | null> {
    const flag = await flagRepo().findOneBy({ id: SMS_SETTINGS_FLAG_ID })
    if (isNil(flag)) {
        return null
    }
    const parsed = StoredSmsSettingsShape.safeParse(flag.value)
    return parsed.success ? parsed.data : null
}

function toPublic({ stored }: ToPublicParams): SmsSettingsPublic {
    return {
        provider: stored.provider,
        accessKeyId: stored.accessKeyId,
        hasAccessKeySecret: true,
        signName: stored.signName,
        templateCode: stored.templateCode,
        sdkAppId: stored.sdkAppId,
        region: stored.region,
        verifiedAt: stored.verifiedAt,
    }
}

function emptyToNull({ value }: EmptyToNullParams): string | null {
    return isNil(value) || value.trim().length === 0 ? null : value.trim()
}

function validation(message: string): ApplicationError {
    return new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message },
    })
}

const SMS_SETTINGS_FLAG_ID = 'SMS_SETTINGS'

const StoredSmsSettingsShape = z.object({
    provider: SmsProviderKind,
    accessKeyId: z.string(),
    accessKeySecret: EncryptedObject,
    signName: z.string(),
    templateCode: z.string(),
    sdkAppId: z.string().nullable(),
    region: z.string().nullable(),
    verifiedAt: z.string().nullable(),
})

type StoredSmsSettings = z.infer<typeof StoredSmsSettingsShape>

type UpdateParams = {
    request: UpdateSmsSettingsRequestBody
}

type SendTestParams = {
    phone: string
    log: FastifyBaseLogger
}

type ToPublicParams = {
    stored: StoredSmsSettings
}

type EmptyToNullParams = {
    value: string | null | undefined
}
