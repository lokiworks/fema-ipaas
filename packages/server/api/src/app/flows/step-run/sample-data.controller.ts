import { CreateStepRunRequestBody, GetSampleDataRequest, PrincipalType, SERVICE_KEY_SECURITY_OPENAPI } from '@fema/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { WorkspaceResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { executionService } from '../execution/execution-service'
import { flowService } from '../flow/flow.service'
import { sampleDataService } from './sample-data.service'

export const sampleDataController: FastifyPluginAsyncZod = async (fastify) => {

    fastify.post('/test-step', TestSampleDataRequestBody, async (request) => {
        return executionService(request.log).test({
            workspaceId: request.workspaceId,
            flowVersionId: request.body.flowVersionId,
            stepNameToTest: request.body.stepName,
            triggeredBy: request.principal.id,
        })
    })

    fastify.get('/', GetSampleDataRequestParams, async (request) => {
        const flow = await flowService(request.log).getOnePopulatedOrThrow({
            id: request.query.flowId,
            workspaceId: request.workspaceId,
            versionId: request.query.flowVersionId,
        })
        const sampleData = await sampleDataService(request.log).getOrReturnEmpty({
            workspaceId: request.workspaceId,
            flowVersion: flow.version,
            stepName: request.query.stepName,
            type: request.query.type,
        })
        return sampleData
    })
}

const GetSampleDataRequestParams = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            undefined, {
                type: WorkspaceResourceType.QUERY,
            }),
    },
    schema: {
        tags: ['sample-data'],
        querystring: GetSampleDataRequest,
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}

const TestSampleDataRequestBody = {
    config: {
        security: securityAccess.workspace(
            [PrincipalType.USER, PrincipalType.SERVICE], 
            undefined, {
                type: WorkspaceResourceType.BODY,
            }),
    },
    schema: {
        tags: ['sample-data'],
        body: CreateStepRunRequestBody,
        security: [SERVICE_KEY_SECURITY_OPENAPI],
    },
}