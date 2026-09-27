import { createHmac } from 'node:crypto'
import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { safeHttp } from '@fema-ipaas/server-utils'
import { NotificationChannelType } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { emailService } from '../helper/email/email-service'
import { NotificationChannelConfig } from './alert.entity'

export const notificationChannelSender = (log: FastifyBaseLogger) => ({
    async send({ tenantId, type, config, message }: SendParams): Promise<SendResult> {
        if (type === NotificationChannelType.EMAIL) {
            if (!emailService(log).isConfigured()) {
                return { success: false, error: 'SMTP is not configured' }
            }
            const { error } = await tryCatch(() => Promise.all(config.recipients.map((to) => emailService(log).sendAlert({
                tenantId,
                to,
                title: message.title,
                body: message.body,
                link: message.link,
            }))))
            return isNil(error) ? { success: true, error: null } : { success: false, error: error.message }
        }
        if (isNil(config.url)) {
            return { success: false, error: 'Channel has no URL' }
        }
        const request = buildRequest({ type, url: config.url, secret: config.secret, message })
        const { error } = await tryCatch(() => safeHttp.axios.post(request.url, request.body, {
            headers: { 'Content-Type': 'application/json', ...request.headers },
            timeout: SEND_TIMEOUT_MS,
        }))
        if (!isNil(error)) {
            log.warn({ type, error: error.message }, '[notificationChannelSender#send] Delivery failed')
            return { success: false, error: error.message }
        }
        return { success: true, error: null }
    },
})

function buildRequest({ type, url, secret, message }: BuildRequestParams): OutgoingRequest {
    const text = plainText(message)
    const timestamp = Date.now()
    switch (type) {
        case NotificationChannelType.FEISHU: {
            const seconds = Math.floor(timestamp / 1000)
            const signature = isNil(secret) ? {} : { timestamp: String(seconds), sign: createHmac('sha256', `${seconds}\n${secret}`).update('').digest('base64') }
            return { url, headers: {}, body: { ...signature, msg_type: 'text', content: { text } } }
        }
        case NotificationChannelType.WECOM:
            return { url, headers: {}, body: { msgtype: 'text', text: { content: text } } }
        case NotificationChannelType.DINGTALK: {
            const signedUrl = isNil(secret)
                ? url
                : `${url}&timestamp=${timestamp}&sign=${encodeURIComponent(createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64'))}`
            return { url: signedUrl, headers: {}, body: { msgtype: 'text', text: { content: text } } }
        }
        case NotificationChannelType.SLACK:
            return { url, headers: {}, body: { text } }
        case NotificationChannelType.WEBHOOK:
        case NotificationChannelType.EMAIL: {
            const body = { title: message.title, text: message.body, link: message.link, sentAt: new Date(timestamp).toISOString() }
            const headers: Record<string, string> = isNil(secret) ? {} : { 'X-Signature': createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex') }
            return { url, headers, body }
        }
    }
}

function plainText(message: AlertMessage): string {
    return [message.title, message.body, message.link].filter((part) => !isNil(part) && part.length > 0).join('\n')
}

const SEND_TIMEOUT_MS = 10_000

export type AlertMessage = {
    title: string
    body: string
    link: string | null
}

type SendParams = {
    tenantId: string
    type: NotificationChannelType
    config: NotificationChannelConfig
    message: AlertMessage
}

type SendResult = {
    success: boolean
    error: string | null
}

type BuildRequestParams = {
    type: NotificationChannelType
    url: string
    secret: string | null
    message: AlertMessage
}

type OutgoingRequest = {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
}
