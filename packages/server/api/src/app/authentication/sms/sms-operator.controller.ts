import { ApplicationEventName, PrincipalType, SmsSettingsPublic, TestSmsSettingsRequestBody, UpdateSmsSettingsRequestBody } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { instanceOperator } from '../../operator/instance-operator'
import { operatorAudit } from '../../operator/operator-audit'
import { smsSettingsService } from './sms-settings.service'

export const smsOperatorController: FastifyPluginAsyncZod = async (app) => {
    app.get('/sms-settings', GetSmsSettingsRequest, async (request): Promise<SmsSettingsPublic | null> => {
        await instanceOperator.assert({ request })
        return smsSettingsService.getPublic()
    })

    app.post('/sms-settings', UpdateSmsSettingsRequest, async (request): Promise<SmsSettingsPublic> => {
        await instanceOperator.assert({ request })
        const settings = await smsSettingsService.update({ request: request.body })
        operatorAudit.recordByOperator({
            request,
            action: ApplicationEventName.OPERATOR_INSTANCE_SETTINGS_UPDATED,
            target: 'sms',
            detail: settings.provider,
        })
        return settings
    })

    app.post('/sms-settings/test', TestSmsSettingsRequest, async (request): Promise<SmsSettingsPublic> => {
        await instanceOperator.assert({ request })
        const settings = await smsSettingsService.sendTest({ phone: request.body.phone, log: request.log })
        operatorAudit.recordByOperator({
            request,
            action: ApplicationEventName.OPERATOR_INSTANCE_SETTINGS_UPDATED,
            target: 'sms',
            detail: 'tested',
        })
        return settings
    })
}

const operatorOnly = securityAccess.unscoped([PrincipalType.USER])

const GetSmsSettingsRequest = {
    config: { security: operatorOnly },
    schema: {
        tags: ['operator'],
        response: { [StatusCodes.OK]: SmsSettingsPublic.nullable() },
    },
}

const UpdateSmsSettingsRequest = {
    config: { security: operatorOnly },
    schema: {
        tags: ['operator'],
        body: UpdateSmsSettingsRequestBody,
        response: { [StatusCodes.OK]: SmsSettingsPublic },
    },
}

const TestSmsSettingsRequest = {
    config: { security: operatorOnly },
    schema: {
        tags: ['operator'],
        body: TestSmsSettingsRequestBody,
        response: { [StatusCodes.OK]: SmsSettingsPublic },
    },
}
