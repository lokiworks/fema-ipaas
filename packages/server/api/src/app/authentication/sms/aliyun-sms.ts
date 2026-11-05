import { createHmac, randomUUID } from 'node:crypto'
import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import { SmsProviderConfig, SmsSendParams, SmsSendResult } from './sms-provider'

async function send({ config, phone, code }: SmsSendParams): Promise<SmsSendResult> {
    const request = buildRequest({
        config,
        phone,
        code,
        timestamp: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
        nonce: randomUUID(),
    })
    const { data: response, error } = await tryCatch(() => safeHttp.axios.post<AliyunResponse>(request.url, request.body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: REQUEST_TIMEOUT_MS,
    }))
    if (!isNil(error) || isNil(response)) {
        return { ok: false, reason: `request failed: ${error?.message ?? 'no response'}` }
    }
    if (response.data.Code !== 'OK') {
        return { ok: false, reason: `${response.data.Code ?? 'unknown'}: ${response.data.Message ?? ''}`.trim() }
    }
    return { ok: true }
}

function buildRequest({ config, phone, code, timestamp, nonce }: BuildRequestParams): AliyunRequest {
    const params: Record<string, string> = {
        AccessKeyId: config.accessKeyId,
        Action: 'SendSms',
        Format: 'JSON',
        PhoneNumbers: toAliyunPhone({ phone }),
        RegionId: DEFAULT_REGION_ID,
        SignName: config.signName,
        SignatureMethod: 'HMAC-SHA1',
        SignatureNonce: nonce,
        SignatureVersion: '1.0',
        TemplateCode: config.templateCode,
        TemplateParam: JSON.stringify({ code }),
        Timestamp: timestamp,
        Version: '2017-05-25',
    }
    const signature = sign({ params, secret: config.accessKeySecret })
    return {
        url: endpointOf({ config }),
        body: `${canonicalize({ params })}&Signature=${percentEncode({ value: signature })}`,
    }
}

function sign({ params, secret }: SignParams): string {
    const stringToSign = `POST&${percentEncode({ value: '/' })}&${percentEncode({ value: canonicalize({ params }) })}`
    return createHmac('sha1', `${secret}&`).update(stringToSign).digest('base64')
}

function canonicalize({ params }: CanonicalizeParams): string {
    return Object.keys(params)
        .sort()
        .map((key) => `${percentEncode({ value: key })}=${percentEncode({ value: params[key] })}`)
        .join('&')
}

function percentEncode({ value }: PercentEncodeParams): string {
    return encodeURIComponent(value)
        .replace(/\+/gu, '%20')
        .replace(/\*/gu, '%2A')
        .replace(/%7E/gu, '~')
        .replace(/[!'()]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function toAliyunPhone({ phone }: ToAliyunPhoneParams): string {
    const digits = phone.replace(/^\+/u, '')
    return digits.startsWith('86') && digits.length === 13 ? digits.slice(2) : digits
}

function endpointOf({ config }: EndpointParams): string {
    const region = config.region?.trim()
    return isNil(region) || region.length === 0 ? 'https://dysmsapi.aliyuncs.com/' : `https://dysmsapi.${region}.aliyuncs.com/`
}

const REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_REGION_ID = 'cn-hangzhou'

export const aliyunSms = {
    send,
    buildRequest,
    sign,
    percentEncode,
    toAliyunPhone,
}

type AliyunResponse = {
    Code?: string
    Message?: string
}

type AliyunRequest = {
    url: string
    body: string
}

type BuildRequestParams = SmsSendParams & {
    timestamp: string
    nonce: string
}

type SignParams = {
    params: Record<string, string>
    secret: string
}

type CanonicalizeParams = {
    params: Record<string, string>
}

type PercentEncodeParams = {
    value: string
}

type ToAliyunPhoneParams = {
    phone: string
}

type EndpointParams = {
    config: SmsProviderConfig
}
