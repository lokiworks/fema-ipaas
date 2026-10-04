import { ServiceCheckFailure } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { serviceFailure } from '../../src/app/health/service-failure'

describe('serviceFailure.classify', () => {
    it('treats a refused connection as unreachable', () => {
        const result = serviceFailure.classify({ error: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:2599'), { code: 'ECONNREFUSED' }) })
        expect(result.failure).toBe(ServiceCheckFailure.UNREACHABLE)
        expect(result.reason).toContain('ECONNREFUSED')
    })

    it('sees a refused connection that nodemailer wraps in a generic socket error', () => {
        const result = serviceFailure.classify({ error: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:25060'), { code: 'ESOCKET' }) })
        expect(result.failure).toBe(ServiceCheckFailure.UNREACHABLE)
    })

    it('treats a login rejection as an authentication failure', () => {
        const result = serviceFailure.classify({ error: Object.assign(new Error('Invalid login: 535 Authentication failed'), { code: 'EAUTH' }) })
        expect(result.failure).toBe(ServiceCheckFailure.AUTHENTICATION)
    })

    it('recognises a plain text server spoken to over TLS', () => {
        const result = serviceFailure.classify({ error: Object.assign(new Error('error:0A00010B:SSL routines:ssl3_get_record:wrong version number'), { code: 'ESOCKET' }) })
        expect(result.failure).toBe(ServiceCheckFailure.TLS)
    })

    it('recognises a timeout by message when the code is generic', () => {
        const result = serviceFailure.classify({ error: new Error('Greeting never received, connection timed out') })
        expect(result.failure).toBe(ServiceCheckFailure.TIMEOUT)
    })

    it('maps object storage credential errors by error name', () => {
        const result = serviceFailure.classify({ error: Object.assign(new Error('The access key id you provided does not exist'), { name: 'InvalidAccessKeyId' }) })
        expect(result.failure).toBe(ServiceCheckFailure.AUTHENTICATION)
    })

    it('maps a missing bucket to a rejection', () => {
        const result = serviceFailure.classify({ error: Object.assign(new Error('The specified bucket does not exist'), { name: 'NoSuchBucket' }) })
        expect(result.failure).toBe(ServiceCheckFailure.REJECTED)
    })

    it('reads the http status of a failed registry request', () => {
        const result = serviceFailure.classify({ error: Object.assign(new Error('Request failed with status code 403'), { response: { status: 403 } }) })
        expect(result.failure).toBe(ServiceCheckFailure.AUTHENTICATION)
    })

    it('never leaves a configured secret in the reason', () => {
        const result = serviceFailure.classify({ error: new Error('login as bob with hunter2 failed'), secrets: ['hunter2'] })
        expect(result.reason).not.toContain('hunter2')
        expect(result.reason).toContain('***')
    })

    it('truncates very long reasons', () => {
        const result = serviceFailure.classify({ error: new Error('x'.repeat(2000)) })
        expect(result.reason.length).toBe(300)
    })
})
