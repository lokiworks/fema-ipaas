import { BuiltinMaskDetector, MaskRuleType, PayloadLevel } from '@fema-ipaas/core-utils'
import { errorSanitizer, logRedaction } from '../../src'

const STACK = [
    'Error: 飞书拒绝了请求',
    '    at Object.code (/private/tmp/fema-e2e/slot-4/worker-cache/v14/codes/abc/step_1/index.js:27:9)',
    '    at process.<anonymous> ([eval]:21:34)',
    '    at Jy (/Users/dev/code/fema-ipaas/packages/server/engine/dist/main.js:5:1)',
].join('\n')

describe('errorSanitizer.stripLocalDetails', () => {
    it('drops the raw stack of a friendly connector error and keeps message, status and error name', () => {
        const text = JSON.stringify({ __apErrorVersion: 1, message: 'HTTP 403: Access denied', status: 403, errorName: 'AxiosError', raw: STACK })
        const parsed = JSON.parse(errorSanitizer.stripLocalDetails({ text }))
        expect(parsed).toMatchObject({ __apErrorVersion: 1, message: 'HTTP 403: Access denied', status: 403, errorName: 'AxiosError' })
        expect(parsed.raw).toBeUndefined()
    })

    it('removes stack frames and local paths from a plain message but keeps the first line', () => {
        const cleaned = errorSanitizer.stripLocalDetails({ text: STACK })
        expect(cleaned).toBe('Error: 飞书拒绝了请求')
        expect(cleaned).not.toContain('/private/tmp')
        expect(cleaned).not.toContain('/Users/')
    })

    it('replaces a local path inside a sentence, on any platform, with a placeholder', () => {
        expect(errorSanitizer.stripLocalDetails({ text: "ENOENT: no such file or directory, open '/home/ubuntu/app/data.csv'" })).toBe("ENOENT: no such file or directory, open '<path>'")
        expect(errorSanitizer.stripLocalDetails({ text: String.raw`cannot read C:\Users\dev\app\data.csv now` })).toBe('cannot read <path> now')
    })

    it('strips escaped frames that live inside a JSON string field', () => {
        const text = JSON.stringify({ __apErrorVersion: 1, message: `boom\n    at f (/opt/app/dist/x.js:1:1)\n    at g (/opt/app/dist/y.js:2:2)` })
        expect(JSON.parse(errorSanitizer.stripLocalDetails({ text })).message).toBe('boom')
    })

    it('leaves URLs, API paths and ordinary messages untouched', () => {
        const text = 'HTTP 404 from https://open.feishu.cn/open-apis/contact/v3/users/ou_123 (GET /v1/users/ou_123)'
        expect(errorSanitizer.stripLocalDetails({ text })).toBe(text)
    })

    it('keeps the error code derivable: friendly status and message survive for classification', () => {
        const text = JSON.stringify({ __apErrorVersion: 1, message: 'HTTP 429: rate limited', status: 429, raw: STACK })
        expect(JSON.parse(errorSanitizer.stripLocalDetails({ text })).status).toBe(429)
    })
})

describe('errorSanitizer.stripFailedStepMessage', () => {
    it('cleans only the message of a failed step', () => {
        const result = errorSanitizer.stripFailedStepMessage({ failedStep: { name: 'step_1', displayName: 'A', message: STACK } })
        expect(result).toEqual({ name: 'step_1', displayName: 'A', message: 'Error: 飞书拒绝了请求' })
    })

    it('passes undefined and messageless steps through', () => {
        expect(errorSanitizer.stripFailedStepMessage({ failedStep: undefined })).toBeUndefined()
        const step = { name: 'step_1', displayName: 'A' }
        expect(errorSanitizer.stripFailedStepMessage({ failedStep: step })).toBe(step)
    })
})

describe('display log redaction strips local paths from step errors', () => {
    const privacy = {
        payloadLevel: PayloadLevel.FULL,
        displayLogsFileId: 'f',
        maskRules: [{ id: 'p', name: '手机号', type: MaskRuleType.BUILTIN, detector: BuiltinMaskDetector.PHONE, pattern: null, enabled: true }],
    }

    it('removes the stack and the path but still masks personal data in the message', () => {
        const errorMessage = JSON.stringify({ __apErrorVersion: 1, message: 'Error: 手机号 13912345678 无效', raw: STACK })
        const { steps } = logRedaction.redactSteps({ steps: { step_1: { type: 'CODE', input: {}, output: null, errorMessage } }, privacy })
        const text = JSON.stringify(steps)
        expect(text).not.toContain('/private/tmp')
        expect(text).not.toContain('worker-cache')
        expect(text).not.toContain('13912345678')
        expect(text).toContain('139****5678')
    })
})
