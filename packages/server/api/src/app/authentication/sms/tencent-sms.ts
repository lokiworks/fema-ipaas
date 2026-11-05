import { createHash, createHmac } from 'node:crypto'
import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import { SmsProviderConfig, SmsSendParams, SmsSendResult } from './sms-provider'

async function send({ config, phone, code }: SmsSendParams): Promise<SmsSendResult> {
    const request = buildRequest({ config, phone, code, timestampSeconds: Math.floor(Date.now() / 1000) })
    const { data: response, error } = await tryCatch(() => safeHttp.axios.post<TencentResponse>(request.url, request.body, {
        headers: request.headers,
        timeout: REQUEST_TIMEOUT_MS,
    }))
    if (!isNil(error) || isNil(response)) {
        return { ok: false, reason: `request failed: ${error?.message ?? 'no response'}` }
    }
    const failure = response.data.Response?.Error
    if (!isNil(failure)) {
        return { ok: false, reason: `${failure.Code}: ${failure.Message}` }
    }
    const status = response.data.Response?.SendStatusSet?.[0]
    if (isNil(status) || status.Code !== 'Ok') {
        return { ok: false, reason: `${status?.Code ?? 'unknown'}: ${status?.Message ?? ''}`.trim() }
    }
    return { ok: true }
}

function buildRequest({ config, phone, code, timestampSeconds }: BuildRequestParams): TencentRequest {
    const body = JSON.stringify({
        PhoneNumberSet: [phone],
        SmsSdkAppId: config.sdkAppId ?? '',
        SignName: config.signName,
        TemplateId: config.templateCode,
        TemplateParamSet: [code],
    })
    const date = new Date(timestampSeconds * 1000).toISOString().slice(0, 10)
    const scope = `${date}/${SERVICE}/tc3_request`
    const canonicalRequest = [
        'POST',
        '/',
        '',
        `content-type:${CONTENT_TYPE}`,
        `host:${HOST}`,
        `x-tc-action:${ACTION.toLowerCase()}`,
        '',
        SIGNED_HEADERS,
        sha256Hex({ value: body }),
    ].join('\n')
    const stringToSign = [ALGORITHM, String(timestampSeconds), scope, sha256Hex({ value: canonicalRequest })].join('\n')
    const secretDate = hmac({ key: `TC3${config.accessKeySecret}`, value: date })
    const secretService = hmac({ key: secretDate, value: SERVICE })
    const secretSigning = hmac({ key: secretService, value: 'tc3_request' })
    const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')
    return {
        url: `https://${HOST}/`,
        body,
        canonicalRequest,
        stringToSign,
        headers: {
            'Authorization': `${ALGORITHM} Credential=${config.accessKeyId}/${scope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
            'Content-Type': CONTENT_TYPE,
            'Host': HOST,
            'X-TC-Action': ACTION,
            'X-TC-Timestamp': String(timestampSeconds),
            'X-TC-Version': VERSION,
            'X-TC-Region': regionOf({ config }),
        },
    }
}

function regionOf({ config }: RegionParams): string {
    const region = config.region?.trim()
    return isNil(region) || region.length === 0 ? DEFAULT_REGION : region
}

function sha256Hex({ value }: Sha256Params): string {
    return createHash('sha256').update(value).digest('hex')
}

function hmac({ key, value }: HmacParams): Buffer {
    return createHmac('sha256', key).update(value).digest()
}

const HOST = 'sms.tencentcloudapi.com'
const SERVICE = 'sms'
const ACTION = 'SendSms'
const VERSION = '2021-01-11'
const ALGORITHM = 'TC3-HMAC-SHA256'
const CONTENT_TYPE = 'application/json; charset=utf-8'
const SIGNED_HEADERS = 'content-type;host;x-tc-action'
const DEFAULT_REGION = 'ap-guangzhou'
const REQUEST_TIMEOUT_MS = 10_000

export const tencentSms = {
    send,
    buildRequest,
}

type TencentResponse = {
    Response?: {
        Error?: { Code: string, Message: string }
        SendStatusSet?: Array<{ Code: string, Message?: string }>
    }
}

type TencentRequest = {
    url: string
    body: string
    canonicalRequest: string
    stringToSign: string
    headers: Record<string, string>
}

type BuildRequestParams = SmsSendParams & {
    timestampSeconds: number
}

type RegionParams = {
    config: SmsProviderConfig
}

type Sha256Params = {
    value: string
}

type HmacParams = {
    key: string | Buffer
    value: string
}
