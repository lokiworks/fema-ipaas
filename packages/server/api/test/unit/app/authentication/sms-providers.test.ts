import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { aliyunSms } from '../../../../src/app/authentication/sms/aliyun-sms'
import { SmsProviderConfig } from '../../../../src/app/authentication/sms/sms-provider'
import { tencentSms } from '../../../../src/app/authentication/sms/tencent-sms'

const ALIYUN: SmsProviderConfig = {
    provider: 'ALIYUN',
    accessKeyId: 'testId',
    accessKeySecret: 'testSecret',
    signName: '阿里云短信测试',
    templateCode: 'SMS_154950909',
    sdkAppId: null,
    region: null,
}

const TENCENT: SmsProviderConfig = {
    provider: 'TENCENT',
    accessKeyId: 'test-tencent-secret-id',
    accessKeySecret: 'test-tencent-secret-key',
    signName: '腾讯云',
    templateCode: '449739',
    sdkAppId: '1400006666',
    region: null,
}

function parseBody(body: string): Record<string, string> {
    return Object.fromEntries(new URLSearchParams(body).entries())
}

describe('aliyunSms', () => {
    it('percent encodes the way the RPC signature demands', () => {
        expect(aliyunSms.percentEncode({ value: 'a b*c~d+e/f' })).toBe('a%20b%2Ac~d%2Be%2Ff')
        expect(aliyunSms.percentEncode({ value: '2026-11-05T01:02:03Z' })).toBe('2026-11-05T01%3A02%3A03Z')
    })

    it('drops the +86 prefix and keeps other country codes', () => {
        expect(aliyunSms.toAliyunPhone({ phone: '+8613800138000' })).toBe('13800138000')
        expect(aliyunSms.toAliyunPhone({ phone: '+85291234567' })).toBe('85291234567')
    })

    it('signs the canonical query with HMAC-SHA1 over "secret&"', () => {
        const request = aliyunSms.buildRequest({
            config: ALIYUN,
            phone: '+8613800138000',
            code: '123456',
            timestamp: '2026-11-05T01:02:03Z',
            nonce: 'nonce-1',
        })
        const sent = parseBody(request.body)
        const { Signature, ...unsigned } = sent
        const canonical = Object.keys(unsigned)
            .sort()
            .map((key) => `${aliyunSms.percentEncode({ value: key })}=${aliyunSms.percentEncode({ value: unsigned[key] })}`)
            .join('&')
        const expected = createHmac('sha1', 'testSecret&')
            .update(`POST&%2F&${encodeURIComponent(canonical)}`)
            .digest('base64')
        expect(Signature).toBe(expected)
        expect(request.url).toBe('https://dysmsapi.aliyuncs.com/')
        expect(unsigned).toMatchObject({
            Action: 'SendSms',
            PhoneNumbers: '13800138000',
            SignName: '阿里云短信测试',
            TemplateCode: 'SMS_154950909',
            TemplateParam: '{"code":"123456"}',
            SignatureMethod: 'HMAC-SHA1',
            SignatureVersion: '1.0',
            Version: '2017-05-25',
            AccessKeyId: 'testId',
        })
    })

    it('never leaks the secret into the request', () => {
        const request = aliyunSms.buildRequest({ config: ALIYUN, phone: '+8613800138000', code: '1', timestamp: 't', nonce: 'n' })
        expect(request.body).not.toContain('testSecret')
    })

    it('targets a regional endpoint when one is configured', () => {
        const request = aliyunSms.buildRequest({ config: { ...ALIYUN, region: 'ap-southeast-1' }, phone: '+6591234567', code: '1', timestamp: 't', nonce: 'n' })
        expect(request.url).toBe('https://dysmsapi.ap-southeast-1.aliyuncs.com/')
    })
})

describe('tencentSms', () => {
    const timestampSeconds = 1_767_574_923

    it('builds a TC3-HMAC-SHA256 signature step by step', () => {
        const request = tencentSms.buildRequest({ config: TENCENT, phone: '+8613800138000', code: '123456', timestampSeconds })
        const date = new Date(timestampSeconds * 1000).toISOString().slice(0, 10)
        const hashedPayload = createHash('sha256').update(request.body).digest('hex')
        const canonicalRequest = `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:sms.tencentcloudapi.com\nx-tc-action:sendsms\n\ncontent-type;host;x-tc-action\n${hashedPayload}`
        expect(request.canonicalRequest).toBe(canonicalRequest)

        const stringToSign = `TC3-HMAC-SHA256\n${timestampSeconds}\n${date}/sms/tc3_request\n${createHash('sha256').update(canonicalRequest).digest('hex')}`
        expect(request.stringToSign).toBe(stringToSign)

        const secretDate = createHmac('sha256', `TC3${TENCENT.accessKeySecret}`).update(date).digest()
        const secretService = createHmac('sha256', secretDate).update('sms').digest()
        const secretSigning = createHmac('sha256', secretService).update('tc3_request').digest()
        const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')
        expect(request.headers.Authorization).toBe(
            `TC3-HMAC-SHA256 Credential=${TENCENT.accessKeyId}/${date}/sms/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`,
        )
    })

    it('sends the code as the single template parameter in E.164 form', () => {
        const request = tencentSms.buildRequest({ config: TENCENT, phone: '+8613800138000', code: '123456', timestampSeconds })
        expect(JSON.parse(request.body)).toEqual({
            PhoneNumberSet: ['+8613800138000'],
            SmsSdkAppId: '1400006666',
            SignName: '腾讯云',
            TemplateId: '449739',
            TemplateParamSet: ['123456'],
        })
        expect(request.headers).toMatchObject({
            'X-TC-Action': 'SendSms',
            'X-TC-Version': '2021-01-11',
            'X-TC-Region': 'ap-guangzhou',
            'X-TC-Timestamp': String(timestampSeconds),
        })
        expect(request.url).toBe('https://sms.tencentcloudapi.com/')
    })

    it('honours the configured region and keeps the secret out of the request', () => {
        const request = tencentSms.buildRequest({ config: { ...TENCENT, region: 'ap-singapore' }, phone: '+6591234567', code: '1', timestampSeconds })
        expect(request.headers['X-TC-Region']).toBe('ap-singapore')
        expect(JSON.stringify(request)).not.toContain(TENCENT.accessKeySecret)
    })
})
