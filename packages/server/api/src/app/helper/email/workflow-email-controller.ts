import { tryCatch } from '@fema-ipaas/core-utils'
import { PrincipalType } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { tenantService } from '../../tenant/tenant.service'
import { mailSender } from './mail-sender'

export const workflowEmailController: FastifyPluginAsyncZod = async (app) => {
    app.post('/email/send', {
        bodyLimit: 15 * 1024 * 1024,
        config: { security: securityAccess.engine() },
        schema: {
            body: z.object({
                to: z.array(z.email()).min(1).max(50), cc: z.array(z.email()).max(50).default([]),
                subject: z.string().max(1000), text: z.string().max(1000000).optional(), html: z.string().max(1000000).optional(),
                attachments: z.array(z.object({ filename: z.string().max(255), content: z.string().max(14000000) })).max(50).default([]),
            }),
            response: { 200: z.object({ messageId: z.string() }), 400: z.object({ message: z.string() }), 403: z.object({}), 503: z.object({ message: z.string() }) },
        },
    }, async (request, reply) => {
        if (request.principal.type !== PrincipalType.ENGINE) return reply.status(403).send({})
        const message = request.body
        const attachments = message.attachments.map((file) => ({ filename: file.filename, content: Buffer.from(file.content, 'base64') }))
        if (message.to.length + message.cc.length > 50 || attachments.reduce((sum, file) => sum + file.content.length, 0) > 10 * 1024 * 1024 || (!message.text && !message.html)) return reply.status(400).send({ message: 'Invalid email content or recipient count' })
        if (!mailSender(request.log).isConfigured()) return reply.status(503).send({ message: 'Platform mail service is not configured' })
        const tenant = await tenantService(request.log).getOne(request.principal.tenant.id)
        const { data, error } = await tryCatch(() => mailSender(request.log).sendWorkflow({ ...message, attachments, tenantName: tenant?.name ?? '集成平台' }))
        if (error) {
            request.log.warn({ error }, 'Workflow email delivery failed')
            return reply.status(503).send({ message: 'Email delivery failed. It may have been accepted; check delivery before sending again.' })
        }
        return data
    })
}
