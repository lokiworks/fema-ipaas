import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { aliyunSms } from './aliyun-sms'
import { SmsProviderConfig, SmsSendResult } from './sms-provider'
import { tencentSms } from './tencent-sms'

async function send({ config, phone, code }: SendParams): Promise<SmsSendResult> {
    switch (config.provider) {
        case 'ALIYUN':
            return aliyunSms.send({ config, phone, code })
        case 'TENCENT':
            return tencentSms.send({ config, phone, code })
    }
}

function notConfigured(): ApplicationError {
    return new ApplicationError({ code: ErrorCode.SMS_NOT_CONFIGURED, params: {} })
}

export const smsSender = {
    send,
    notConfigured,
}

type SendParams = {
    config: SmsProviderConfig
    phone: string
    code: string
}
