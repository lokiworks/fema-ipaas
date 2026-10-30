import { failureDetails } from '../../src/lib/helper/failure-details'

describe('failureDetails.build', () => {
    const now = new Date('2026-10-30T02:30:35.170Z')

    it('carries the external error code, the readable message and the local time of a Feishu failure', () => {
        const errorMessage = JSON.stringify({
            __apErrorVersion: 1,
            message: 'department not exist — the department does not exist in Feishu, check the department ID or the department mapping table (Feishu error 41017)\n[fix-owner=MAPPING_OWNER]',
            readableMessage: '飞书中不存在该部门，请检查部门 ID 或部门映射表（飞书错误码 41017）',
        })

        expect(failureDetails.build({ errorMessage, now })).toEqual({
            errorCode: '41017',
            errorCategory: 'STEP_FAILED',
            errorMessage: '飞书中不存在该部门，请检查部门 ID 或部门映射表（飞书错误码 41017）',
            rawMessage: 'department not exist — the department does not exist in Feishu, check the department ID or the department mapping table (Feishu error 41017)',
            errorTime: '2026-10-30 10:30:35',
            errorTimeIso: '2026-10-30T02:30:35.170Z',
        })
    })

    it('strips internal markers and falls back to a Chinese category when the connector gives no readable message', () => {
        const errorMessage = JSON.stringify({ __apErrorVersion: 1, message: 'HTTP 404: Route not found\n[fix-owner=WORKFLOW_OWNER]', status: 404 })

        const details = failureDetails.build({ errorMessage, now })

        expect(details.errorCode).toBe('HTTP_404')
        expect(details.errorCategory).toBe('HTTP_404')
        expect(details.errorMessage).toBe('目标系统返回 HTTP 404：HTTP 404: Route not found')
        expect(details.rawMessage).not.toContain('fix-owner')
    })

    it('classifies a failed HTTP node by status so the failure branch can tell 4xx from 5xx', () => {
        const errorMessage = JSON.stringify({ response: { status: 503, body: { message: 'upstream unavailable' } }, request: { body: { id: 1 } } })

        const details = failureDetails.build({ errorMessage, now })

        expect(details.errorCode).toBe('HTTP_503')
        expect(details.errorCategory).toBe('HTTP_503')
        expect(details.errorMessage).toBe('目标系统返回 HTTP 503：HTTP 503: upstream unavailable')
        expect(details.rawMessage).toBe('HTTP 503: upstream unavailable')
    })

    it('reads a Beisen code that is followed by more text', () => {
        const details = failureDetails.build({ errorMessage: 'The organization does not exist (Beisen code 417 bad org). Pick it again.', now })

        expect(details.errorCode).toBe('417')
        expect(details.errorCategory).toBe('HTTP_417')
    })
})
