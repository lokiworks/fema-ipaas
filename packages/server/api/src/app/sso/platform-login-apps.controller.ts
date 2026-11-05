import {
    ApplicationEventName,
    PlatformLoginAppKind,
    PlatformLoginAppPublic,
    PrincipalType,
    UpdatePlatformLoginAppRequestBody,
} from '@fema-ipaas/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { applicationEvents } from '../helper/application-events'
import { instanceOperator } from '../operator/instance-operator'
import { platformLoginAppsService } from './platform-login-apps.service'

export const platformLoginAppsController: FastifyPluginAsyncZod = async (app) => {
    app.get('/', ListRequest, async (request): Promise<PlatformLoginAppPublic[]> => {
        await instanceOperator.assert({ request })
        return platformLoginAppsService.listPublic()
    })

    app.post('/:kind', SaveRequest, async (request): Promise<PlatformLoginAppPublic[]> => {
        await instanceOperator.assert({ request })
        const apps = await platformLoginAppsService.save({ kind: request.params.kind, request: request.body })
        audit({ request, detail: `${request.params.kind}: ${request.body.enabled ? 'on' : 'off'}` })
        return apps
    })

    app.delete('/:kind', RemoveRequest, async (request): Promise<PlatformLoginAppPublic[]> => {
        await instanceOperator.assert({ request })
        const apps = await platformLoginAppsService.remove({ kind: request.params.kind })
        audit({ request, detail: `${request.params.kind}: removed` })
        return apps
    })
}

function audit({ request, detail }: { request: FastifyRequest, detail: string }): void {
    applicationEvents(request.log).sendUserEvent(request, {
        action: ApplicationEventName.OPERATOR_INSTANCE_SETTINGS_UPDATED,
        data: { target: 'platform-login-apps', detail },
    })
}

const operatorOnly = securityAccess.unscoped([PrincipalType.USER])
const KindParams = z.object({ kind: PlatformLoginAppKind })

const ListRequest = {
    config: { security: operatorOnly },
    schema: { tags: ['operator'], response: { [StatusCodes.OK]: z.array(PlatformLoginAppPublic) } },
}

const SaveRequest = {
    config: { security: operatorOnly },
    schema: { tags: ['operator'], params: KindParams, body: UpdatePlatformLoginAppRequestBody, response: { [StatusCodes.OK]: z.array(PlatformLoginAppPublic) } },
}

const RemoveRequest = {
    config: { security: operatorOnly },
    schema: { tags: ['operator'], params: KindParams, response: { [StatusCodes.OK]: z.array(PlatformLoginAppPublic) } },
}
