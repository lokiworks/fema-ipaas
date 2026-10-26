import { createHmac, timingSafeEqual } from 'node:crypto'
import { isObject, tryCatchSync } from '@fema-ipaas/core-utils'
import { WorkflowTrigger, WorkflowTriggerType } from '@fema-ipaas/shared'

function requiresVerification(trigger: WorkflowTrigger): boolean {
    return trigger.type === WorkflowTriggerType.CONNECTOR && trigger.settings.connectorName === '@fema-ipaas/connector-webhook' && trigger.settings.triggerName === 'catch_webhook' && trigger.settings.input['authType'] === 'hmac'
}

function verify({ trigger, payload }: { trigger: WorkflowTrigger, payload: unknown }): boolean {
    if (!requiresVerification(trigger) || trigger.type !== WorkflowTriggerType.CONNECTOR) return true
    const fields = trigger.settings.input['authFields']
    if (!isObject(fields)) return false
    const header = fields['hmacHeaderName']
    const secret = fields['hmacSecret']
    const algorithm = fields['hmacAlgorithm'] ?? 'sha256'
    const encoding = fields['hmacEncoding'] ?? 'hex'
    const prefix = fields['hmacSignaturePrefix'] ?? ''
    if (typeof header !== 'string' || typeof secret !== 'string' || !secret.length || secret.includes('{{') || !['sha256', 'sha1', 'sha512'].includes(String(algorithm)) || (encoding !== 'hex' && encoding !== 'base64') || typeof prefix !== 'string') return false
    if (!isObject(payload) || !isObject(payload['headers'])) return false
    const rawBody = payload['rawBody']
    const signature = payload['headers'][header.toLowerCase()]
    if (typeof signature !== 'string' || !signature.startsWith(prefix) || (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody))) return false
    const { data, error } = tryCatchSync(() => {
        const expected = createHmac(String(algorithm), secret).update(rawBody).digest(encoding)
        const actual = signature.slice(prefix.length)
        const first = Buffer.from(expected)
        const second = Buffer.from(actual)
        return first.length === second.length && timingSafeEqual(first, second)
    })
    return !error && data === true
}

export const webhookSignature = { requiresVerification, verify }
