import fs from 'fs/promises'
import path from 'path'
import { isNil, tryCatch } from '@fema-ipaas/core-utils'
import { FastifyBaseLogger } from 'fastify'
import Mustache from 'mustache'
import nodemailer from 'nodemailer'
import { system } from '../system/system'
import { AppSystemProp } from '../system/system-props'

const TEMPLATE_DIR = path.resolve(__dirname, '..', '..', '..', 'assets', 'emails')
const templateCache = new Map<string, string>()

async function readTemplate(name: string): Promise<string> {
    const cached = templateCache.get(name)
    if (!isNil(cached)) {
        return cached
    }
    const contents = await fs.readFile(path.join(TEMPLATE_DIR, `${name}.html`), 'utf-8')
    templateCache.set(name, contents)
    return contents
}

function buildTransport() {
    const host = system.get(AppSystemProp.SMTP_HOST)
    const port = system.getNumber(AppSystemProp.SMTP_PORT)
    if (isNil(host) || isNil(port)) {
        return null
    }
    const user = system.get(AppSystemProp.SMTP_USERNAME)
    const pass = system.get(AppSystemProp.SMTP_PASSWORD)
    const rejectUnauthorized = system.getBoolean(AppSystemProp.SMTP_TLS_REJECT_UNAUTHORIZED) ?? true
    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        ...(isNil(user) || isNil(pass) ? {} : { auth: { user, pass } }),
        tls: { rejectUnauthorized },
    })
}

export const mailSender = (log: FastifyBaseLogger) => ({
    isConfigured(): boolean {
        return !isNil(system.get(AppSystemProp.SMTP_HOST)) && !isNil(system.getNumber(AppSystemProp.SMTP_PORT))
    },

    async send({ to, subject, template, variables }: SendParams): Promise<void> {
        const transport = buildTransport()
        if (isNil(transport)) {
            log.warn({ template, to }, '[mailSender#send] SMTP is not configured, dropping email')
            return
        }
        const [body, footer] = await Promise.all([readTemplate(template), readTemplate('footer')])
        const html = Mustache.render(body, variables, { footer })
        const senderEmail = system.get(AppSystemProp.SMTP_SENDER_EMAIL) ?? 'no-reply@localhost'
        const senderName = system.get(AppSystemProp.SMTP_SENDER_NAME) ?? variables.tenantName

        const { error } = await tryCatch(() => transport.sendMail({
            from: `${senderName} <${senderEmail}>`,
            to,
            subject,
            html,
        }))
        if (!isNil(error)) {
            log.error({ error, template, to }, '[mailSender#send] Failed to deliver email')
            return
        }
        log.info({ template, to }, '[mailSender#send] Email sent')
    },
})

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
