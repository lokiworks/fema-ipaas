import { ApplicationError, ErrorCode } from '@fema-ipaas/core-utils'
import { ApplicationEventName, PrincipalType, SsoProvider, SsoSettings, SsoTestStartResponse, UpdateFeishuSsoRequestBody, UpdateOidcSsoRequestBody } from '@fema-ipaas/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { ssoConfigService } from './sso-config.service'
import { isSsoLoginError } from './sso-errors'
import { ssoLoginService } from './sso-login.service'
import { ssoState } from './sso-state'

export const ssoAdminController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', AdminRead, async (request): Promise<SsoSettings> => {
        return ssoConfigService(request.log).getSettings({ tenantId: request.principal.tenant.id })
    })

    app.post('/oidc', SaveOidcRequest, async (request): Promise<SsoSettings> => {
        const result = await ssoConfigService(request.log).saveOidc({ tenantId: request.principal.tenant.id, request: request.body })
        audit({ request, target: SsoProvider.OIDC, detail: describeChange({ enabled: request.body.enabled, changed: result.changed }) })
        return result.settings
    })

    app.post('/feishu', SaveFeishuRequest, async (request): Promise<SsoSettings> => {
        const result = await ssoConfigService(request.log).saveFeishu({ tenantId: request.principal.tenant.id, request: request.body })
        audit({ request, target: SsoProvider.FEISHU, detail: describeChange({ enabled: request.body.enabled, changed: result.changed }) })
        return result.settings
    })

    app.post('/:provider/enabled', EnabledRequest, async (request): Promise<SsoSettings> => {
        const settings = await ssoConfigService(request.log).setEnabled({
            tenantId: request.principal.tenant.id,
            provider: request.params.provider,
            enabled: request.body.enabled,
        })
        audit({ request, target: request.params.provider, detail: request.body.enabled ? 'enabled' : 'disabled' })
        return settings
    })

    app.post('/:provider/test', TestRequest, async (request, reply): Promise<SsoTestStartResponse> => {
        const started = await startTest({ log: request.log, tenantId: request.principal.tenant.id, provider: request.params.provider, actorUserId: request.principal.id })
        void reply.header('set-cookie', ssoState.buildBindingCookie({ binding: started.binding }))
        return { url: started.redirectUrl }
    })
}

async function startTest({ log, tenantId, provider, actorUserId }: StartTestParams) {
    try {
        return await ssoLoginService(log).start({ tenantId, provider, mode: 'test', actorUserId })
    }
    catch (error) {
        if (isSsoLoginError(error)) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message: error.detail } })
        }
        throw error
    }
}

function describeChange({ enabled, changed }: DescribeChangeParams): string {
    const fields = changed.length === 0 ? 'no field changed' : `changed ${changed.join(', ')}`
    return `${enabled ? 'on' : 'off'}; ${fields}`
}

function audit({ request, target, detail }: AuditParams): void {
    applicationEvents(request.log).sendUserEvent(request, {
        action: ApplicationEventName.SSO_SETTINGS_UPDATED,
        data: { target, detail },
    })
}

const adminOnly = securityAccess.tenantAdminOnly([PrincipalType.USER])
const ProviderParams = z.object({ provider: z.enum(SsoProvider) })
const EnabledBody = z.object({ enabled: z.boolean() })

const AdminRead = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], response: { [StatusCodes.OK]: SsoSettings } },
}

const SaveOidcRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], body: UpdateOidcSsoRequestBody, response: { [StatusCodes.OK]: SsoSettings } },
}

const SaveFeishuRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], body: UpdateFeishuSsoRequestBody, response: { [StatusCodes.OK]: SsoSettings } },
}

const EnabledRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], params: ProviderParams, body: EnabledBody, response: { [StatusCodes.OK]: SsoSettings } },
}

const TestRequest = {
    config: { security: adminOnly },
    schema: { tags: ['tenant-access'], params: ProviderParams, response: { [StatusCodes.OK]: SsoTestStartResponse } },
}

type AuditParams = {
    request: FastifyRequest
    target: string
    detail: string
}

type DescribeChangeParams = {
    enabled: boolean
    changed: string[]
}

type StartTestParams = {
    log: FastifyBaseLogger
    tenantId: string
    provider: SsoProvider
    actorUserId: string
}
