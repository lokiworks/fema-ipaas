import fs from 'fs/promises'
import path from 'path'
import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { ServiceCheckFailure } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import Mustache from 'mustache'
import nodemailer from 'nodemailer'
import { Attachment } from 'nodemailer/lib/mailer'
import { serviceFailure } from '../../health/service-failure'
import { system } from '../system/system'
import { AppSystemProp } from '../system/system-props'

const TEMPLATE_DIR = path.resolve(__dirname, '..', '..', '..', 'assets', 'emails')
const templateCache = new Map<string, string>()
const SMTP_TIMEOUT_MS = 10000
const TEST_MAIL_SUBJECT = '测试邮件 / Test email'
const TEST_MAIL_TEXT = '这是一封测试邮件。收到它，说明平台的邮件服务配置正确。\n\nThis is a test email. If you received it, the mail service is configured correctly.'
let lastDelivery: MailDelivery | null = null

async function readTemplate(name: string): Promise<string> {
    const cached = templateCache.get(name)
    if (!isNil(cached)) {
        return cached
    }
    const contents = await fs.readFile(path.join(TEMPLATE_DIR, `${name}.html`), 'utf-8')
    templateCache.set(name, contents)
    return contents
}

function smtpPort(): number | null {
    const port = system.getNumber(AppSystemProp.SMTP_PORT)
    return isNil(port) || !Number.isInteger(port) || port <= 0 || port > 65535 ? null : port
}

function smtpHost(): string | null {
    const host = system.get(AppSystemProp.SMTP_HOST)
    return isNil(host) || host.trim().length === 0 ? null : host.trim()
}

function buildTransport({ candidate }: { candidate?: SmtpCandidate } = {}) {
    const host = isNil(candidate) ? smtpHost() : candidate.host
    const port = isNil(candidate) ? smtpPort() : candidate.port
    if (isNil(host) || isNil(port)) {
        return null
    }
    const user = isNil(candidate) ? system.get(AppSystemProp.SMTP_USERNAME) : candidate.username
    const pass = isNil(candidate) ? system.get(AppSystemProp.SMTP_PASSWORD) : candidate.password
    const rejectUnauthorized = system.getBoolean(AppSystemProp.SMTP_TLS_REJECT_UNAUTHORIZED) ?? true
    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        ...(isNil(user) || isNil(pass) ? {} : { auth: { user, pass } }),
        tls: { rejectUnauthorized },
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
    })
}

function senderAddress({ tenantName, candidate }: { tenantName: string, candidate?: SmtpCandidate }): string {
    const senderEmail = (isNil(candidate) ? system.get(AppSystemProp.SMTP_SENDER_EMAIL) : candidate.senderEmail) ?? 'no-reply@localhost'
    const senderName = (isNil(candidate) ? system.get(AppSystemProp.SMTP_SENDER_NAME) : candidate.senderName) ?? tenantName
    return `${senderName} <${senderEmail}>`
}

function recordDelivery({ ok, error }: { ok: boolean, error: unknown }): void {
    const classified = ok ? null : serviceFailure.classify({ error, secrets: smtpSecrets() })
    lastDelivery = {
        ok,
        at: new Date().toISOString(),
        failure: classified?.failure ?? null,
        reason: classified?.reason ?? null,
    }
}

function smtpSecrets({ candidate }: { candidate?: SmtpCandidate } = {}): string[] {
    const password = isNil(candidate) ? system.get(AppSystemProp.SMTP_PASSWORD) : candidate.password
    return isNil(password) || password.length === 0 ? [] : [password]
}

export const mailSender = (log: FastifyBaseLogger) => ({
    isConfigured(): boolean {
        return !isNil(smtpHost()) && !isNil(smtpPort())
    },

    configurationProblem(): string | null {
        const host = smtpHost()
        const port = smtpPort()
        if (isNil(host) && isNil(system.get(AppSystemProp.SMTP_PORT))) {
            return null
        }
        if (isNil(host)) {
            return 'FEMA_SMTP_HOST is not set'
        }
        if (isNil(port)) {
            return 'FEMA_SMTP_PORT is missing or is not a port number between 1 and 65535'
        }
        const senderEmail = system.get(AppSystemProp.SMTP_SENDER_EMAIL)
        if (!isNil(senderEmail) && !senderEmail.includes('@')) {
            return 'FEMA_SMTP_SENDER_EMAIL is not an email address'
        }
        return null
    },

    lastDelivery(): MailDelivery | null {
        return lastDelivery
    },

    async verify({ candidate }: { candidate?: SmtpCandidate } = {}): Promise<MailVerification> {
        const transport = buildTransport({ candidate })
        if (isNil(transport)) {
            return { ok: false, failure: ServiceCheckFailure.NOT_CONFIGURED, reason: null }
        }
        const { error } = await tryCatch(() => transport.verify())
        if (!isNil(error)) {
            log.warn({ error }, '[mailSender#verify] SMTP connection check failed')
            return { ok: false, ...serviceFailure.classify({ error, secrets: smtpSecrets({ candidate }) }) }
        }
        return { ok: true, failure: null, reason: null }
    },

    async sendTest({ to, tenantName, candidate }: { to: string, tenantName: string, candidate?: SmtpCandidate }): Promise<MailVerification> {
        const transport = buildTransport({ candidate })
        if (isNil(transport)) {
            return { ok: false, failure: ServiceCheckFailure.NOT_CONFIGURED, reason: null }
        }
        const { error } = await tryCatch(() => transport.sendMail({
            from: senderAddress({ tenantName, candidate }),
            to,
            subject: TEST_MAIL_SUBJECT,
            text: TEST_MAIL_TEXT,
        }))
        if (isNil(candidate)) {
            recordDelivery({ ok: isNil(error), error })
        }
        if (!isNil(error)) {
            log.warn({ error, to }, '[mailSender#sendTest] Test email was not delivered')
            return { ok: false, ...serviceFailure.classify({ error, secrets: smtpSecrets({ candidate }) }) }
        }
        return { ok: true, failure: null, reason: null }
    },

    async sendWorkflow({ tenantName, to, cc, subject, text, html, attachments }: WorkflowMailParams): Promise<{ messageId: string }> {
        const transport = buildTransport()
        if (isNil(transport)) throw new Error('Platform mail service is not configured')
        const { data, error } = await tryCatch(() => transport.sendMail({ from: senderAddress({ tenantName }), to, cc, subject, text, html, attachments, disableFileAccess: true, disableUrlAccess: true }))
        transport.close()
        recordDelivery({ ok: isNil(error), error })
        if (error) throw error
        if ((data.rejected?.length ?? 0) > 0) throw new Error('Some recipients were rejected. Review delivery before sending again.')
        return { messageId: String(data.messageId) }
    },

    async send({ to, subject, template, variables }: SendParams): Promise<void> {
        const transport = buildTransport()
        if (isNil(transport)) {
            log.warn({ template, to }, '[mailSender#send] SMTP is not configured, dropping email')
            return
        }
        const [body, footer] = await Promise.all([readTemplate(template), readTemplate('footer')])
        const html = Mustache.render(body, variables, { footer })

        const { error } = await tryCatch(() => transport.sendMail({
            from: senderAddress({ tenantName: variables.tenantName }),
            to,
            subject,
            html,
        }))
        recordDelivery({ ok: isNil(error), error })
        if (!isNil(error)) {
            log.error({ error, template, to }, '[mailSender#send] Failed to deliver email')
            return
        }
        log.info({ template, to }, '[mailSender#send] Email sent')
    },
})

export type SmtpCandidate = {
    host: string
    port: number
    username: string | undefined
    password: string | undefined
    senderEmail: string | undefined
    senderName: string | undefined
}

export type MailDelivery = {
    ok: boolean
    at: string
    failure: ServiceCheckFailure | null
    reason: string | null
}

export type MailVerification = {
    ok: boolean
    failure: ServiceCheckFailure | null
    reason: string | null
}

export type MailTemplateVariables = {
    tenantName: string
    fullLogoUrl: string
    primaryColor: string
    primaryColorLight: string
    [key: string]: string
}

type SendParams = {
    to: string
    subject: string
    template: string
    variables: MailTemplateVariables
}

type WorkflowMailParams = { tenantName: string, to: string[], cc: string[], subject: string, text?: string, html?: string, attachments: Attachment[] }
