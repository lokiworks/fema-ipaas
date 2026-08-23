import { assertNotNullOrUndefined } from '@fema-ipaas/core-utils'
import { EnginePrincipal, GetVariableForWorkerRequestParams, RevealVariableResponse } from '@fema-ipaas/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { variableService } from './variable.service'

export const variableWorkerController: FastifyPluginAsyncZod = async (app) => {
    app.get('/:name', GetVariableRequest, async (request): Promise<RevealVariableResponse> => {
        const enginePrincipal = (request.principal as EnginePrincipal)
        assertNotNullOrUndefined(enginePrincipal.workspaceId, 'workspaceId')
        const value = await variableService(request.log).getDecryptedValueForWorker({
            workspaceId: enginePrincipal.workspaceId,
            name: request.params.name,
        })
        return { value }
    })
}

const GetVariableRequest = {
    config: {
        security: securityAccess.engine(),
    },
    schema: {
        params: GetVariableForWorkerRequestParams,
        response: {
            [StatusCodes.OK]: RevealVariableResponse,
        },
    },
}
