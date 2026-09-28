import { errorHandlingUtils, FAILED_STEP_MESSAGE_MAX_LENGTH, truncateFailedStepMessage } from '../../src'

describe('truncateFailedStepMessage', () => {
    const friendlyWithStack = JSON.stringify({
        __apErrorVersion: 1,
        message: 'HTTP 403: Access denied. One of the following scopes is required: [contact:contact] (Feishu error 99991672)',
        status: 403,
        responseBody: { code: 99991672, detail: 'x'.repeat(2000) },
        raw: `Error: boom\n${'    at frame (/app/connector.js:1:1)\n'.repeat(40)}`,
    })

    it('keeps a long friendly connector error as valid JSON with its status and message', () => {
        const result = truncateFailedStepMessage({ name: 'step_2', displayName: '开通飞书账号', message: friendlyWithStack })
        const message = result?.message ?? ''
        expect(message.length).toBeLessThanOrEqual(FAILED_STEP_MESSAGE_MAX_LENGTH)
        const parsed = JSON.parse(message)
        expect(parsed).toMatchObject({ __apErrorVersion: 1, status: 403 })
        expect(parsed.raw).toBeUndefined()
        expect(parsed.responseBody).toBeUndefined()
        const classified = errorHandlingUtils.classifyErrorMessage({ message })
        expect(classified.errorCode).toBe('HTTP_403')
        expect(classified.message).toContain('[contact:contact]')
    })

    it('still cuts a long plain message to the limit', () => {
        const result = truncateFailedStepMessage({ name: 'step_1', displayName: 'Step', message: 'y'.repeat(2000) })
        expect(result?.message.length).toBeLessThanOrEqual(FAILED_STEP_MESSAGE_MAX_LENGTH + 1)
    })

    it('leaves short messages untouched', () => {
        const failedStep = { name: 'step_1', displayName: 'Step', message: 'fetch failed' }
        expect(truncateFailedStepMessage(failedStep)).toBe(failedStep)
    })
})
