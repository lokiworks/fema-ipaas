import { SmsProviderKind } from '@fema-ipaas/shared'

export type SmsProviderConfig = {
    provider: SmsProviderKind
    accessKeyId: string
    accessKeySecret: string
    signName: string
    templateCode: string
    sdkAppId: string | null
    region: string | null
}

export type SmsSendResult =
    | { ok: true }
    | { ok: false, reason: string }

export type SmsSendParams = {
    config: SmsProviderConfig
    phone: string
    code: string
}
